// Checks the OIDC token GitHub Actions sends with a deploy. The token proves
// which repository, branch and commit the workflow runs for; GitHub signs it
// and we check the signature against GitHub's published keys. No long-lived
// deploy secret lives in GitHub.
import { readFileSync } from 'node:fs';
import { createLocalJWKSet, createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';
import { z } from 'zod';

export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';

const claimsSchema = z.object({
  jti: z.string().min(1),
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  repository_owner: z.string().min(1),
  ref: z.string().min(1),
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  actor: z.string().min(1),
  run_id: z.string().min(1),
  event_name: z.string().min(1),
});
export type GithubClaims = z.infer<typeof claimsSchema>;

export class TokenError extends Error {}

export type VerifyOptions = { keys: JWTVerifyGetKey; audience: string; allowedOwners: string[] };

export async function verifyGithubToken(token: string, opts: VerifyOptions): Promise<GithubClaims> {
  let payload: unknown;
  try {
    ({ payload } = await jwtVerify(token, opts.keys, {
      issuer: GITHUB_ISSUER,
      audience: opts.audience,
      algorithms: ['RS256'],
      clockTolerance: 30,
    }));
  } catch (e) {
    throw new TokenError(`Token rejected: ${(e as Error).message}`);
  }
  const claims = claimsSchema.safeParse(payload);
  if (!claims.success) throw new TokenError('Token is missing repository, ref or sha');
  const owner = claims.data.repository_owner.toLowerCase();
  if (!opts.allowedOwners.some((o) => o.toLowerCase() === owner)) {
    throw new TokenError(`Repositories of ${claims.data.repository_owner} may not deploy here`);
  }
  return claims.data;
}

let keys: JWTVerifyGetKey | undefined;

function serverKeys(): JWTVerifyGetKey {
  if (keys) return keys;
  // Local development only: tokens minted by scripts/dev-oidc.ts, signed with
  // a key on this machine. Never honoured in production.
  const devFile = process.env.GITHUB_OIDC_DEV_JWKS;
  if (devFile && process.env.NODE_ENV !== 'production') {
    keys = createLocalJWKSet(JSON.parse(readFileSync(devFile, 'utf8')));
  } else {
    keys = createRemoteJWKSet(new URL(`${GITHUB_ISSUER}/.well-known/jwks`));
  }
  return keys;
}

/** Reads the bearer token of a request and checks it with the server's settings. */
export async function githubClaims(req: Request): Promise<GithubClaims> {
  const token = /^Bearer (.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) throw new TokenError('Missing bearer token');
  return verifyGithubToken(token, {
    keys: serverKeys(),
    audience: process.env.GITHUB_OIDC_AUDIENCE ?? 'gust.zephyron.tech',
    allowedOwners: (process.env.GITHUB_ALLOWED_OWNERS ?? 'Zephyron-Tech')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  });
}
