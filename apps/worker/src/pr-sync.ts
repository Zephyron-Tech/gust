// Keeps the pull_requests table in line with GitHub. The webhook does this too, but GitHub does not
// send a failed delivery again (the web may be down during an update), so a closed pull request whose
// webhook was missed would keep its preview. This compares every few minutes and removes what is left.
import { db, deployments, projects, pullRequests, services } from '@gust/db';
import { enqueuePreviewRemove } from '@gust/db/queue';
import { and, eq, inArray, isNotNull, like, sql } from 'drizzle-orm';

import { listOpenPullRequests, type OpenPullRequest } from './github';

/**
 * What to change so Gust agrees with GitHub: the pull requests Gust has as open that GitHub no longer
 * lists (to close), and every pull request that has a live preview but is not open (to remove).
 * With an incomplete list nothing is closed or removed, because a missing one may just be on a page not read.
 */
export function diffPullRequests(
  open: { number: number }[],
  known: { number: number; state: string }[],
  livePreviews: number[],
  complete: boolean,
): { close: number[]; remove: number[] } {
  if (!complete) return { close: [], remove: [] };
  const openNumbers = new Set(open.map((p) => p.number));
  const close = known.filter((p) => p.state === 'open' && !openNumbers.has(p.number)).map((p) => p.number);
  const remove = [...new Set([...close, ...livePreviews.filter((n) => !openNumbers.has(n))])];
  return { close, remove };
}

let running = false;

export async function syncPullRequests(log: (msg: string) => void) {
  if (running) return;
  running = true;
  try {
    const list = await db
      .select({ id: projects.id, slug: projects.slug, repo: projects.githubRepo })
      .from(projects)
      .where(and(eq(projects.engine, true), isNotNull(projects.githubRepo)));
    for (const p of list) {
      if (!p.repo) continue;
      try {
        const result = await listOpenPullRequests(p.repo);
        if (!result) return; // GitHub App not configured on this worker: nothing to compare with
        await syncProject(p, result.prs, result.complete, log);
      } catch (e) {
        log(`pull request sync of ${p.slug} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    running = false;
  }
}

async function syncProject(p: { id: string; slug: string }, open: OpenPullRequest[], complete: boolean, log: (msg: string) => void) {
  // Open on GitHub: make sure Gust has it as open. The change time moves only when the head or state did,
  // since the preview limit evicts the least recently changed pull request first.
  for (const pr of open) {
    const row = { state: 'open', headSha: pr.headSha, headRepo: pr.headRepo, title: pr.title.slice(0, 300), author: pr.author };
    await db
      .insert(pullRequests)
      .values({ id: `pr_${p.slug}_${pr.number}`, projectId: p.id, number: pr.number, ...row })
      .onConflictDoUpdate({
        target: [pullRequests.projectId, pullRequests.number],
        set: {
          ...row,
          updatedAt: sql`case when ${pullRequests.headSha} <> excluded.head_sha or ${pullRequests.state} <> excluded.state then now() else ${pullRequests.updatedAt} end`,
        },
      });
  }

  const known = await db
    .select({ number: pullRequests.number, state: pullRequests.state })
    .from(pullRequests)
    .where(eq(pullRequests.projectId, p.id));
  const live = await db
    .select({ branch: deployments.branch })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .where(and(eq(services.projectId, p.id), eq(deployments.state, 'live'), like(deployments.branch, 'pr-%')));
  const livePreviews = [...new Set(live.map((r) => Number(r.branch?.slice(3))))].filter((n) => Number.isInteger(n));

  const { close, remove } = diffPullRequests(open, known, livePreviews, complete);
  if (close.length) {
    await db
      .update(pullRequests)
      .set({ state: 'closed', updatedAt: new Date() })
      .where(and(eq(pullRequests.projectId, p.id), inArray(pullRequests.number, close)));
  }
  for (const number of remove) {
    await enqueuePreviewRemove({ slug: p.slug, number, reason: 'closed' });
    log(`${p.slug}: pull request #${number} is not open on GitHub, removing its preview`);
  }
}
