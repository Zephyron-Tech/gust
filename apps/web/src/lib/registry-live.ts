import 'server-only';

import { previewHost } from '@gust/contracts';
import { db, deployments, projects, services } from '@gust/db';
import { and, eq } from 'drizzle-orm';

/** Where a live tag runs: its project and service, the branch or pull request, and the URL. */
export type LiveUse = { project: string; service: string; branch: string | null; label: string; url: string | null };

/**
 * Which tags of a registry repository run live right now, and where. Only
 * deployments in state live count: an older tag that was replaced is not live.
 */
export async function liveTagsForRepo(repo: string): Promise<Map<string, LiveUse[]>> {
  const domain = process.env.GUST_DOMAIN;
  const rows = await db
    .select({
      tag: deployments.tag,
      branch: deployments.branch,
      service: services.name,
      domains: services.domains,
      project: projects.slug,
      productionBranch: projects.productionBranch,
    })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(services.image, repo), eq(deployments.state, 'live')));
  const byTag = new Map<string, LiveUse[]>();
  for (const r of rows) {
    // A pull request preview is named pr-<n>; a branch preview by its branch.
    const pr = r.branch?.match(/^pr-(\d+)$/);
    const label = pr ? `PR #${pr[1]}` : (r.branch ?? r.productionBranch ?? 'main');
    const url = r.branch
      ? domain
        ? `https://${previewHost(r.branch, r.project, domain)}`
        : null
      : r.domains?.[0]
        ? `https://${r.domains[0]}`
        : null;
    const uses = byTag.get(r.tag) ?? [];
    uses.push({ project: r.project, service: r.service, branch: r.branch, label, url });
    byTag.set(r.tag, uses);
  }
  return byTag;
}
