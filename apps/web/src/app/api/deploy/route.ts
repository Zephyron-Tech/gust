import { db, githubTokenUses } from '@gust/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { DeployError, startDeploy } from '@/lib/deploy-runner';
import { GithubDeployError, serviceForToken, spendToken } from '@/lib/github-deploy';
import { githubClaims, TokenError } from '@/lib/github-oidc';
import { deploymentUrl } from '@/lib/public-url';
import { evictForPullRequest } from '@/lib/pull-requests';

const body = z.object({
  service: z.string().regex(/^[a-z0-9-]+$/),
  tag: z.string().regex(/^[\w][\w.-]{0,127}$/),
  message: z.string().max(500).optional(),
});

// Called by GitHub Actions after it pushed an image (see
// .github/actions/deploy). Authenticated by the workflow's OIDC token, not by
// a session.
export async function POST(req: Request) {
  let claims: Awaited<ReturnType<typeof githubClaims>>;
  try {
    claims = await githubClaims(req);
  } catch (e) {
    if (e instanceof TokenError) return Response.json({ error: e.message }, { status: 401 });
    throw e;
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Send service and tag' }, { status: 400 });

  try {
    const { project, service, branch, headSha, pullRequest, projectId } = await serviceForToken(claims, parsed.data.service);
    await spendToken(claims);
    // A pull request preview may need room: the limit removes the least recently changed other one.
    if (pullRequest !== undefined) await evictForPullRequest(projectId, project.slug, pullRequest);
    try {
      const id = await startDeploy({
        project: project.slug,
        service: service.name,
        tag: parsed.data.tag,
        branch,
        author: claims.actor,
        actor: `github:${claims.repository}`,
        push: {
          // A pull request's status belongs on its head commit, not on the merge commit the run builds.
          sha: headSha ?? claims.sha,
          message: parsed.data.message?.split('\n')[0],
          repository: claims.repository,
          runId: claims.run_id,
        },
      });
      return Response.json({ id, url: deploymentUrl(project.slug, service.name, id) }, { status: 202 });
    } catch (e) {
      // Nothing started, so the workflow may try again with the same token.
      await db.delete(githubTokenUses).where(eq(githubTokenUses.jti, claims.jti));
      throw e;
    }
  } catch (e) {
    if (e instanceof GithubDeployError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof DeployError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
