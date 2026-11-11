// Writes a deploy's state next to its commit on GitHub, as the Gust GitHub
// App. Optional: without GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY nothing is
// sent. A failure here never fails the deploy.
import { createPrivateKey } from 'node:crypto';
import { createRequire } from 'node:module';
import { importPKCS8, SignJWT } from 'jose';

export type CommitState = 'pending' | 'success' | 'failure';

// libsodium-wrappers' ESM build cannot load under Node (it imports a file it does not ship), so the CJS build is used.
const sodium = createRequire(import.meta.url)('libsodium-wrappers') as typeof import('libsodium-wrappers');

const API = 'https://api.github.com';
const tokens = new Map<string, { token: string; expires: number }>();
type Permissions = Record<string, 'read' | 'write'>;

function appConfigured() {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
}

async function appJwt() {
  // GitHub hands out PKCS#1 keys; jose wants PKCS#8.
  const pem = (process.env.GITHUB_APP_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  const pkcs8 = createPrivateKey(pem).export({ type: 'pkcs8', format: 'pem' }).toString();
  const key = await importPKCS8(pkcs8, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(String(process.env.GITHUB_APP_ID))
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .sign(key);
}

/** One GitHub API call. Some answers have no body (a secret update is 204), so an empty body is an empty object. */
export async function gh(path: string, auth: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', authorization: auth, ...init.headers },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>;
}

/** An installation token for the repository with the given permissions, cached until shortly before it expires. */
async function repoToken(repository: string, permissions: Permissions = { statuses: 'write' }) {
  const key = `${repository} ${JSON.stringify(permissions)}`;
  const cached = tokens.get(key);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const jwt = `Bearer ${await appJwt()}`;
  const installation = await gh(`/repos/${repository}/installation`, jwt);
  const created = await gh(`/app/installations/${installation.id}/access_tokens`, jwt, {
    method: 'POST',
    body: JSON.stringify({ repositories: [repository.split('/')[1]], permissions }),
  });
  const token = String(created.token);
  tokens.set(key, { token, expires: Date.parse(String(created.expires_at)) });
  return token;
}

/**
 * Writes Actions secrets to a repository, encrypted to its public key (libsodium sealed box, as
 * GitHub requires). Throws on failure; the caller records the reason. The values never reach logs.
 */
export async function setActionsSecrets(repository: string, secrets: Record<string, string>) {
  if (!appConfigured()) throw new Error('GitHub App is not configured on the worker');
  const token = `token ${await repoToken(repository, { secrets: 'write', metadata: 'read' })}`;
  const key = (await gh(`/repos/${repository}/actions/secrets/public-key`, token)) as { key_id: string; key: string };
  await sodium.ready;
  const publicKey = sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL);
  for (const [name, value] of Object.entries(secrets)) {
    const encrypted = sodium.crypto_box_seal(value, publicKey);
    await gh(`/repos/${repository}/actions/secrets/${name}`, token, {
      method: 'PUT',
      body: JSON.stringify({ encrypted_value: sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL), key_id: key.key_id }),
    });
  }
}

export function statusBody(state: CommitState, service: string, url: string, error?: string | null) {
  const description = { pending: 'Deploying…', success: 'Live', failure: error ?? 'Deploy failed' }[state];
  return { state, context: `gust/${service}`, target_url: url, description: description.slice(0, 140) };
}

export async function setCommitStatus(
  input: { repository: string; sha: string; service: string; url: string; error?: string | null },
  state: CommitState,
  log: (line: string) => void,
) {
  if (!appConfigured()) return;
  try {
    const token = await repoToken(input.repository);
    await gh(`/repos/${input.repository}/statuses/${input.sha}`, `token ${token}`, {
      method: 'POST',
      body: JSON.stringify(statusBody(state, input.service, input.url, input.error)),
    });
  } catch (e) {
    log(`commit status for ${input.repository}@${input.sha.slice(0, 7)} not sent: ${(e as Error).message}`);
  }
}
