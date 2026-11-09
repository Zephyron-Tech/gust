import 'server-only';

// Deploys started by GitHub Actions. The OIDC token decides everything that
// matters: which repository, which branch, which commit. The request body only
// names the service in that repository's project and the image tag it pushed.
import { deployTarget } from '@gust/contracts';
import { db, githubTokenUses, projects, services } from '@gust/db';
import { and, eq, sql } from 'drizzle-orm';

import type { GithubClaims } from './github-oidc';

export class GithubDeployError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * The project, service and branch a token from this repository may deploy, or an error saying why not.
 * `branch` is null for production and the preview branch name otherwise.
 */
export async function serviceForToken(claims: GithubClaims, service: string) {
  const [row] = await db
    .select({ project: projects, service: services })
    .from(services)
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(sql`lower(${projects.githubRepo}) = lower(${claims.repository})`, eq(services.name, service)));
  if (!row) throw new GithubDeployError(`No service "${service}" belongs to ${claims.repository}`, 404);
  const target = deployTarget(claims.ref, row.project.productionBranch, row.project.previewBranches);
  if (!target) {
    const allowed = [row.project.productionBranch, ...row.project.previewBranches].map((b) => `refs/heads/${b}`).join(', ');
    throw new GithubDeployError(`Only ${allowed} may deploy; this run is for ${claims.ref}`, 403);
  }
  return { ...row, branch: target.branch };
}

/** Marks the token as used. A second deploy with the same token is refused. */
export async function spendToken(claims: GithubClaims) {
  const inserted = await db
    .insert(githubTokenUses)
    .values({ jti: claims.jti, repository: claims.repository })
    .onConflictDoNothing()
    .returning({ jti: githubTokenUses.jti });
  if (!inserted.length) throw new GithubDeployError('This token was already used for a deploy', 409);
}
