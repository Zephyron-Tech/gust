// Local development only: mints a token shaped like the one GitHub Actions
// sends, signed with a key kept in .dev-oidc/ on this machine. Gust accepts
// it when GITHUB_OIDC_DEV_JWKS points at .dev-oidc/jwks.json and NODE_ENV is
// not production.
//
//   pnpm --filter @gust/web dev:oidc -- --repo Zephyron-Tech/gust --ref refs/heads/main --sha <40 hex>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { exportJWK, generateKeyPair, importJWK, type JWK, SignJWT } from 'jose';

const dir = new URL('../.dev-oidc/', import.meta.url);
const keyFile = new URL('key.json', dir);

const { values } = parseArgs({
  options: {
    repo: { type: 'string', default: 'Zephyron-Tech/gust' },
    ref: { type: 'string', default: 'refs/heads/main' },
    sha: { type: 'string', default: '0'.repeat(40) },
    actor: { type: 'string', default: 'dev' },
    audience: { type: 'string', default: process.env.GITHUB_OIDC_AUDIENCE ?? 'gust.zephyron.tech' },
  },
});

if (!existsSync(keyFile)) {
  mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const pub = { ...(await exportJWK(publicKey)), kid: 'gust-dev', alg: 'RS256', use: 'sig' };
  writeFileSync(keyFile, JSON.stringify({ ...(await exportJWK(privateKey)), kid: 'gust-dev', alg: 'RS256' }));
  writeFileSync(new URL('jwks.json', dir), JSON.stringify({ keys: [pub] }));
  console.error('Created a dev signing key in apps/web/.dev-oidc/');
}

const jwk = JSON.parse(readFileSync(keyFile, 'utf8')) as JWK;
const key = await importJWK(jwk, 'RS256');
const repo = values.repo ?? '';
const token = await new SignJWT({
  repository: repo,
  repository_owner: repo.split('/')[0],
  ref: values.ref,
  sha: values.sha,
  actor: values.actor,
  run_id: String(Date.now()),
  event_name: 'push',
})
  .setProtectedHeader({ alg: 'RS256', kid: 'gust-dev' })
  .setIssuer('https://token.actions.githubusercontent.com')
  .setAudience(values.audience ?? '')
  .setSubject(`repo:${repo}:ref:${values.ref}`)
  .setJti(crypto.randomUUID())
  .setIssuedAt()
  .setExpirationTime('5m')
  .sign(key);

console.log(token);
