// Writes a deploy's state next to its commit on GitHub, as the Gust GitHub
// App. Optional: without GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY nothing is
// sent. A failure here never fails the deploy.
import { createPrivateKey } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';

export type CommitState = 'pending' | 'success' | 'failure';

const API = 'https://api.github.com';
const tokens = new Map<string, { token: string; expires: number }>();

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

async function gh(path: string, auth: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', authorization: auth, ...init.headers },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

/** An installation token for the repository, cached until shortly before it expires. */
async function repoToken(repository: string) {
  const cached = tokens.get(repository);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const jwt = `Bearer ${await appJwt()}`;
  const installation = await gh(`/repos/${repository}/installation`, jwt);
  const created = await gh(`/app/installations/${installation.id}/access_tokens`, jwt, {
    method: 'POST',
    body: JSON.stringify({ repositories: [repository.split('/')[1]], permissions: { statuses: 'write' } }),
  });
  const token = String(created.token);
  tokens.set(repository, { token, expires: Date.parse(String(created.expires_at)) });
  return token;
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
