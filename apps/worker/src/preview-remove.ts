// Removes a pull request's preview: its live deploys are marked first, so the reconcile loop never
// restores them, then the engine removes the containers and their routes.
import { db, deployments, projects, services } from '@gust/db';
import type { PreviewRemoveJob } from '@gust/db/queue';
import { and, eq, inArray } from 'drizzle-orm';

import { engineFetch } from './engine';

export async function runPreviewRemove(job: PreviewRemoveJob, log: (msg: string) => void) {
  const branch = `pr-${job.number}`;
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, job.slug));
  if (!project) return;
  const apps = await db
    .select({ id: services.id, name: services.name })
    .from(services)
    .where(and(eq(services.projectId, project.id), eq(services.type, 'app')));
  if (apps.length === 0) return;

  await db
    .update(deployments)
    .set({
      state: 'cancelled',
      error: job.reason === 'closed' ? 'Pull request closed' : 'Preview removed to keep the limit of pull request previews',
    })
    .where(
      and(
        inArray(
          deployments.serviceId,
          apps.map((a) => a.id),
        ),
        eq(deployments.branch, branch),
        eq(deployments.state, 'live'),
      ),
    );

  for (const app of apps) {
    const res = await engineFetch(`/v1/services/${job.slug}/${app.name}/remove-branch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ branch }),
    });
    if (!res.ok) throw new Error(`engine answered ${res.status} for ${app.name} ${branch}`);
  }
  log(`preview ${branch} of ${job.slug} removed (${job.reason})`);
}
