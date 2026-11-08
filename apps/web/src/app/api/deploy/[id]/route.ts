import { db, deployments, projects, services } from '@gust/db';
import { and, eq, sql } from 'drizzle-orm';

import { githubClaims, TokenError } from '@/lib/github-oidc';
import { deploymentUrl } from '@/lib/public-url';

// The workflow polls this until its deploy is live or failed, so the GitHub
// job ends with the deploy's outcome. A token sees only deploys of its own
// repository.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let repository: string;
  try {
    ({ repository } = await githubClaims(req));
  } catch (e) {
    if (e instanceof TokenError) return Response.json({ error: e.message }, { status: 401 });
    throw e;
  }
  const { id } = await params;
  const [row] = await db
    .select({ state: deployments.state, error: deployments.error, project: projects.slug, service: services.name })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(deployments.id, id), sql`lower(${projects.githubRepo}) = lower(${repository})`));
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ id, state: row.state, error: row.error, url: deploymentUrl(row.project, row.service, id) });
}
