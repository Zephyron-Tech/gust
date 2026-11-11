import 'server-only';

// Pull requests of engine projects: kept from the GitHub App webhook, and the preview limit a new
// PR deploy must respect.
import { previewHost } from '@gust/contracts';
import { db, deployments, projects, pullRequests, services } from '@gust/db';
import { enqueuePreviewRemove } from '@gust/db/queue';
import { and, desc, eq, inArray, like } from 'drizzle-orm';

import { MAX_PR_PREVIEWS, pickEviction } from './github-webhook';

/** Before a PR preview deploys: removes the least recently changed other PR preview when the limit is full. */
export async function evictForPullRequest(projectId: string, slug: string, number: number): Promise<number | null> {
  const live = await db
    .select({ branch: deployments.branch })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .where(and(eq(services.projectId, projectId), eq(deployments.state, 'live'), like(deployments.branch, 'pr-%')));
  const others = [...new Set(live.map((r) => Number(r.branch?.slice(3))))].filter((n) => Number.isInteger(n) && n !== number);
  if (others.length === 0) return null;

  const rows = await db
    .select({ number: pullRequests.number, updatedAt: pullRequests.updatedAt })
    .from(pullRequests)
    .where(and(eq(pullRequests.projectId, projectId), inArray(pullRequests.number, others)));
  const victim = pickEviction(rows, MAX_PR_PREVIEWS);
  if (victim !== null) await enqueuePreviewRemove({ slug, number: victim, reason: 'evicted' });
  return victim;
}

/** Open pull requests of a project whose preview is live, newest change first. */
export async function openPullRequestPreviews(slug: string, domain: string | undefined) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug));
  if (!project) return [];
  const live = await db
    .select({ branch: deployments.branch })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .where(and(eq(services.projectId, project.id), eq(deployments.state, 'live'), like(deployments.branch, 'pr-%')));
  const liveBranches = new Set(live.map((r) => r.branch));
  const prs = await db
    .select({ number: pullRequests.number, title: pullRequests.title, author: pullRequests.author })
    .from(pullRequests)
    .where(and(eq(pullRequests.projectId, project.id), eq(pullRequests.state, 'open')))
    .orderBy(desc(pullRequests.updatedAt));
  return prs
    .filter((pr) => liveBranches.has(`pr-${pr.number}`))
    .map((pr) => ({ ...pr, host: domain ? previewHost(`pr-${pr.number}`, slug, domain) : null }));
}
