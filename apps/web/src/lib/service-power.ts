import 'server-only';

// Stop and start a service by hand. Stop sets services.stopped first (so the worker
// does not restore it), then the engine takes its containers out and stops them.
// Start clears the flag and deploys the service's live production image again.
import { auditEvents, db, deployments, projects, services } from '@gust/db';
import { and, desc, eq } from 'drizzle-orm';
import { DeployError, findService, startDeploy } from './deploy-runner';
import { engineFetch } from './engine-server';

export async function stopService(project: string, service: string, actor: string) {
  const row = await findService(project, service);
  if (!row) throw new DeployError('Service not found');
  if (row.service.type !== 'app' || !row.project.engine) throw new DeployError('Only engine app services can be stopped here');
  if (row.service.stopped) return { alreadyStopped: true };

  await db.update(services).set({ stopped: true }).where(eq(services.id, row.service.id));
  const res = await engineFetch(`/v1/services/${project}/${service}/stop`, { method: 'POST' }).catch(() => null);
  if (!res?.ok) {
    await db.update(services).set({ stopped: false }).where(eq(services.id, row.service.id));
    throw new DeployError('The engine did not stop the containers. Nothing changed.');
  }
  await db.insert(auditEvents).values({ actor, action: 'service.stop', target: `${project}/${service}`, detail: null });
  return { alreadyStopped: false };
}

export async function startService(project: string, service: string, actor: string, author: string) {
  const row = await findService(project, service);
  if (!row) throw new DeployError('Service not found');
  if (row.service.type !== 'app' || !row.project.engine) throw new DeployError('Only engine app services can be started here');
  const [live] = await db
    .select({ tag: deployments.tag })
    .from(deployments)
    .where(and(eq(deployments.serviceId, row.service.id), eq(deployments.state, 'live')))
    .orderBy(desc(deployments.createdAt))
    .limit(1);
  if (!live) throw new DeployError('Nothing to start: the service has no live deploy yet. Deploy it first.');

  await db.update(services).set({ stopped: false }).where(eq(services.id, row.service.id));
  try {
    await startDeploy({ project, service, tag: live.tag, actor, author });
  } catch (e) {
    await db.update(services).set({ stopped: true }).where(eq(services.id, row.service.id));
    throw e;
  }
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
