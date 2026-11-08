import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { GITHUB_ISSUER, TokenError, type VerifyOptions, verifyGithubToken } from './github-oidc';

let sign: (claims: Record<string, unknown>, o?: { iss?: string; aud?: string; exp?: string; key?: CryptoKey }) => Promise<string>;
let opts: VerifyOptions;
let otherKey: CryptoKey;

const claims = {
  repository: 'Zephyron-Tech/smart-targets-core',
  repository_owner: 'Zephyron-Tech',
  ref: 'refs/heads/main',
  sha: 'a'.repeat(40),
  actor: 'vandlj',
  run_id: '42',
  event_name: 'push',
};

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] });
  opts = { keys: jwks, audience: 'gust.zephyron.tech', allowedOwners: ['Zephyron-Tech'] };
  sign = (c, o = {}) =>
    new SignJWT(c)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(o.iss ?? GITHUB_ISSUER)
      .setAudience(o.aud ?? 'gust.zephyron.tech')
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime(o.exp ?? '5m')
      .sign(o.key ?? privateKey);
});

describe('verifyGithubToken', () => {
  it('accepts a token from an allowed owner and returns its claims', async () => {
    const c = await verifyGithubToken(await sign(claims), opts);
    expect(c.repository).toBe('Zephyron-Tech/smart-targets-core');
    expect(c.ref).toBe('refs/heads/main');
  });

  it('matches the owner without regard to case', async () => {
    await expect(verifyGithubToken(await sign({ ...claims, repository_owner: 'zephyron-tech' }), opts)).resolves.toBeTruthy();
  });

  it('refuses a token from another owner', async () => {
    const t = await sign({ ...claims, repository: 'evil/smart-targets-core', repository_owner: 'evil' });
    await expect(verifyGithubToken(t, opts)).rejects.toThrow(/evil may not deploy/);
  });

  it('refuses a token for another audience', async () => {
    await expect(verifyGithubToken(await sign(claims, { aud: 'someone-else' }), opts)).rejects.toBeInstanceOf(TokenError);
  });

  it('refuses a token from another issuer', async () => {
    await expect(verifyGithubToken(await sign(claims, { iss: 'https://example.com' }), opts)).rejects.toBeInstanceOf(TokenError);
  });

  it('refuses an expired token', async () => {
    await expect(verifyGithubToken(await sign(claims, { exp: '-2m' }), opts)).rejects.toThrow(/exp/);
  });

  it('refuses a token signed with another key', async () => {
    await expect(verifyGithubToken(await sign(claims, { key: otherKey }), opts)).rejects.toBeInstanceOf(TokenError);
  });

  it('refuses a token without a commit', async () => {
    const { sha: _, ...noSha } = claims;
    await expect(verifyGithubToken(await sign(noSha), opts)).rejects.toThrow(/missing/);
  });

  it('refuses an unsigned token', async () => {
    const [, payload] = (await sign(claims)).split('.');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${payload}.`;
    await expect(verifyGithubToken(none, opts)).rejects.toBeInstanceOf(TokenError);
  });
});
