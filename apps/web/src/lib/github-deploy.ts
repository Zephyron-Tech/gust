import 'server-only';

// Deploys started by GitHub Actions. The OIDC token decides everything that
// matters: which repository, which branch, which commit. The request body only
// names the service in that repository's project and the image tag it pushed.
import { deployTarget } from '@gust/contracts';
import { db, githubTokenUses, projects, pullRequests, services } from '@gust/db';
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
    throw new GithubDeployError(`Only ${allowed} and pull requests may deploy; this run is for ${claims.ref}`, 403);
  }
  if (target.pullRequest === undefined)
    return { ...row, branch: target.branch, headSha: null, pullRequest: undefined, projectId: row.project.id };

  // A pull request preview: the run must be a pull_request run, the PR must be open in Gust,
  // and its head must live in this repository (forks never get a preview).
  if (claims.event_name !== 'pull_request') throw new GithubDeployError('Pull request previews deploy from pull_request runs only', 403);
  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.projectId, row.project.id), eq(pullRequests.number, target.pullRequest)));
  if (pr?.state !== 'open') throw new GithubDeployError(`Pull request #${target.pullRequest} is not open in Gust`, 403);
  if (pr?.headRepo.toLowerCase() !== claims.repository.toLowerCase()) {
    throw new GithubDeployError('Pull requests from forks do not get previews', 403);
  }
  return { ...row, branch: target.branch, headSha: pr.headSha, pullRequest: target.pullRequest, projectId: row.project.id };
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
