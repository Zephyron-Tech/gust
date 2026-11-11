import 'server-only';

// Stop and start a service by hand, for production or for its previews. Stop sets the
// flag first (so the worker does not restore it), then the engine stops the containers of
// that part. Start clears the flag and deploys the live image of each part again.
import { auditEvents, db, deployments, projects, services } from '@gust/db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DeployError, findService, startDeploy } from './deploy-runner';
import { engineFetch } from './engine-server';

export type PowerTarget = 'production' | 'previews';

const flagOf = (target: PowerTarget) => (target === 'production' ? 'stopped' : 'previewsStopped');

async function setFlag(serviceId: string, target: PowerTarget, value: boolean) {
  const set = target === 'production' ? { stopped: value } : { previewsStopped: value };
  await db.update(services).set(set).where(eq(services.id, serviceId));
}

export async function stopService(project: string, service: string, target: PowerTarget, actor: string) {
  const row = await findService(project, service);
  if (!row) throw new DeployError('Service not found');
  if (row.service.type !== 'app' || !row.project.engine) throw new DeployError('Only engine app services can be stopped here');
  if (row.service[flagOf(target)]) return { alreadyStopped: true };

  await setFlag(row.service.id, target, true);
  const res = await engineFetch(`/v1/services/${project}/${service}/stop`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: target }),
  }).catch(() => null);
  if (!res?.ok) {
    await setFlag(row.service.id, target, false);
    throw new DeployError('The engine did not stop the containers. Nothing changed.');
  }
  await db.insert(auditEvents).values({ actor, action: `service.stop.${target}`, target: `${project}/${service}`, detail: null });
  return { alreadyStopped: false };
}

export async function startService(project: string, service: string, target: PowerTarget, actor: string, author: string) {
  const row = await findService(project, service);
  if (!row) throw new DeployError('Service not found');
  if (row.service.type !== 'app' || !row.project.engine) throw new DeployError('Only engine app services can be started here');

  if (target === 'production') {
    const [live] = await db
      .select({ tag: deployments.tag })
      .from(deployments)
      .where(and(eq(deployments.serviceId, row.service.id), eq(deployments.state, 'live'), isNull(deployments.branch)))
      .orderBy(desc(deployments.createdAt))
      .limit(1);
    if (!live) throw new DeployError('Nothing to start: the service has no live deploy yet. Deploy it first.');
    await setFlag(row.service.id, target, false);
    try {
      await startDeploy({ project, service, tag: live.tag, actor, author });
    } catch (e) {
      await setFlag(row.service.id, target, true);
      throw e;
    }
    return;
  }

  // Previews: the live image of each preview branch, so every branch comes back as it was.
  const lives = await liveByBranch(row.service.id);
  if (lives.length === 0) throw new DeployError('Nothing to start: no preview has a live deploy yet.');
  await setFlag(row.service.id, target, false);
  for (const { branch, tag } of lives) {
    await startDeploy({ project, service, tag, branch, actor, author });
  }
}

/** Newest live deploy of each preview branch of a service. */
async function liveByBranch(serviceId: string) {
  const rows = await db
    .select({ branch: deployments.branch, tag: deployments.tag })
    .from(deployments)
    .where(and(eq(deployments.serviceId, serviceId), eq(deployments.state, 'live')))
    .orderBy(desc(deployments.createdAt));
  const seen = new Map<string, string>();
  for (const r of rows) if (r.branch && !seen.has(r.branch)) seen.set(r.branch, r.tag);
  return [...seen].map(([branch, tag]) => ({ branch, tag }));
}

/** Every app service of a project, in the order the project lists them. */
export async function projectServices(slug: string) {
  const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug));
  if (!p) return null;
  return db
    .select({ name: services.name })
    .from(services)
    .where(and(eq(services.projectId, p.id), eq(services.type, 'app')));
}
