import 'server-only';

import { db, deployments, projects, services } from '@gust/db';
import { and, eq } from 'drizzle-orm';

export type LiveUse = { project: string; service: string; branch: string | null };

/**
 * Which tags of a registry repository run live right now, and where. Only
 * deployments in state live count: an older tag that was replaced is not live.
 */
export async function liveTagsForRepo(repo: string): Promise<Map<string, LiveUse[]>> {
  const rows = await db
    .select({ tag: deployments.tag, branch: deployments.branch, service: services.name, project: projects.slug })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(services.image, repo), eq(deployments.state, 'live')));
  const byTag = new Map<string, LiveUse[]>();
  for (const r of rows) {
    const uses = byTag.get(r.tag) ?? [];
    uses.push({ project: r.project, service: r.service, branch: r.branch });
    byTag.set(r.tag, uses);
  }
  return byTag;
}
