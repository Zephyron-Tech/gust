// Keeps reality in line with the database. When a service's live deployment
// has no running container (Docker was reset, someone removed it by hand),
// the worker deploys the same image again. A restore for a service is tried
// at most once every RESTORE_COOLDOWN_MS, so a broken image cannot loop.
import { RUNNING_STATES } from '@gust/contracts';
import { auditEvents, db, deployments, projects, services } from '@gust/db';
import { enqueueDeploy } from '@gust/db/queue';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';

import { engineFetch } from './engine';

const RESTORE_COOLDOWN_MS = 2 * 60_000;
const running = [...RUNNING_STATES];

export async function reconcile(log: (line: string) => void) {
  const res = await engineFetch('/v1/containers').catch(() => null);
  if (!res?.ok) return; // engine down: nothing to compare against
  const containers = (await res.json()) as { state: string; deployment?: string }[];
  const runningDeployments = new Set(containers.filter((c) => c.state === 'running').map((c) => c.deployment));

  const live = await db
    .select({ d: deployments, s: services, p: projects })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(deployments.state, 'live'), eq(projects.engine, true)));

  for (const { d, s, p } of live) {
    if (runningDeployments.has(d.id)) continue;
    const [recent] = await db
      .select({ id: deployments.id, state: deployments.state, createdAt: deployments.createdAt })
      .from(deployments)
      .where(and(eq(deployments.serviceId, s.id), gt(deployments.createdAt, d.createdAt)))
      .orderBy(desc(deployments.createdAt))
      .limit(1);
    if (recent && (running.includes(recent.state) || Date.now() - recent.createdAt.getTime() < RESTORE_COOLDOWN_MS)) continue;

    const id = `dpl_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
    await db.insert(deployments).values({
      id,
      serviceId: s.id,
      trigger: 'reconcile',
      tag: d.tag,
      imageRef: d.imageRef,
      message: `Restore ${d.tag}: its container was gone`,
      author: 'Gust',
    });
    await db.insert(auditEvents).values({
      actor: 'gust',
      action: 'deploy.restore',
      target: `${p.slug}/${s.name}`,
      detail: { deploymentId: id, missing: d.id, tag: d.tag },
    });
    await enqueueDeploy(id);
    log(`${p.slug}/${s.name}: container of ${d.id} is gone, restoring ${d.tag} as ${id}`);
  }
}

/** Deploys that were mid-way when the worker stopped are marked failed on start. */
export async function failInterrupted() {
  await db
    .update(deployments)
    .set({ state: 'failed', error: 'Interrupted: the worker restarted during this deploy', finishedAt: new Date() })
    .where(inArray(deployments.state, ['pulling', 'starting', 'healthy']));
}
