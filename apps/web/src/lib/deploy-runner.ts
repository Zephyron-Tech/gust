import 'server-only';

// Runs a deploy on the server: writes the deployment row, calls the engine,
// stores every event as a log line and moves the state along. It does not
// depend on the browser tab that started it; the UI reads the rows back.
// In production this moves to apps/worker on a pg-boss queue; the rows and
// states stay the same.
import { RUNNING_STATES } from '@gust/contracts';
import { db, deploymentLogs, deployments, projects, services } from '@gust/db';
import { and, eq, inArray, lt, ne } from 'drizzle-orm';

import { engineFetch, registryHost } from './engine-server';

type Running = (typeof RUNNING_STATES)[number];
const running = [...RUNNING_STATES] as Running[];

export class DeployError extends Error {}

export async function findService(project: string, service: string) {
  const [row] = await db
    .select({ service: services, project: projects })
    .from(services)
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(projects.slug, project), eq(services.name, service)));
  return row;
}

/** Marks deploys that were running when the server stopped as failed. */
export async function failInterrupted() {
  await db
    .update(deployments)
    .set({ state: 'failed', error: 'Interrupted: Gust restarted while this deploy was running', finishedAt: new Date() })
    .where(and(inArray(deployments.state, running), lt(deployments.createdAt, new Date(Date.now() - 5 * 60_000))));
}

export async function startDeploy(input: { project: string; service: string; tag: string; rollbackOf?: string; author: string }) {
  const row = await findService(input.project, input.service);
  if (!row?.project.engine) throw new DeployError('This service is not deployed through the engine');
  const svc = row.service;
  if (svc.type !== 'app' || !svc.port) throw new DeployError('Only app services can be deployed');

  const [busy] = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(and(eq(deployments.serviceId, svc.id), inArray(deployments.state, running)));
  if (busy) throw new DeployError(`A deploy is already running (${busy.id})`);

  const id = `dpl_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const imageRef = `${registryHost()}/${svc.image}:${input.tag}`;
  await db.insert(deployments).values({
    id,
    serviceId: svc.id,
    trigger: input.rollbackOf ? 'rollback' : 'manual',
    tag: input.tag,
    imageRef,
    message: input.rollbackOf ? `Roll back to ${input.tag}` : `Deploy ${input.tag}`,
    author: input.author,
    rollbackOf: input.rollbackOf ?? null,
  });

  // Not awaited: the request returns at once and the deploy carries on.
  void run(id, svc, imageRef).catch(async (e) => {
    await db
      .update(deployments)
      .set({ state: 'failed', error: (e as Error).message, finishedAt: new Date() })
      .where(eq(deployments.id, id));
  });
  return id;
}

async function run(id: string, svc: typeof services.$inferSelect, imageRef: string) {
  const log = (phase: string, line: string, ts = new Date()) => db.insert(deploymentLogs).values({ deploymentId: id, phase, line, ts });

  const res = await engineFetch('/v1/deployments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      deploymentId: id,
      project: svc.projectId.replace(/^prj_/, ''),
      service: svc.name,
      image: imageRef,
      port: svc.port,
      healthPath: svc.healthPath ?? '/',
      domains: svc.domains,
      cpu: svc.cpu,
      memoryMb: svc.memoryMb,
      healthTimeout: 30,
      env: { STARTUP_DELAY_MS: '1500' },
    }),
  }).catch(() => null);

  if (!res?.ok || !res.body) {
    await log('fail', 'The engine did not answer. Is it running?');
    await db
      .update(deployments)
      .set({ state: 'failed', error: 'Engine unreachable', finishedAt: new Date() })
      .where(eq(deployments.id, id));
    return;
  }

  const decoder = new TextDecoder();
  let buf = '';
  let ok = false;
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(frame)?.[1];
      const data = /^data: (.*)$/m.exec(frame)?.[1];
      if (!data) continue;
      const e = JSON.parse(data);
      if (event === 'deploy') {
        await log(e.phase, e.line, new Date(e.ts));
        const patch: Partial<typeof deployments.$inferInsert> = {};
        if (e.state) patch.state = e.state;
        if (e.containerId) patch.containerId = e.containerId;
        if (e.phase === 'fail') patch.error = e.line;
        if (Object.keys(patch).length) await db.update(deployments).set(patch).where(eq(deployments.id, id));
      }
      if (event === 'done') ok = Boolean(e.ok);
    }
  }

  const now = new Date();
  if (ok) {
    await db.transaction(async (tx) => {
      await tx.update(deployments).set({ state: 'live', liveAt: now, finishedAt: now }).where(eq(deployments.id, id));
      await tx
        .update(deployments)
        .set({ state: 'superseded' })
        .where(and(eq(deployments.serviceId, svc.id), eq(deployments.state, 'live'), ne(deployments.id, id)));
    });
  } else {
    await db.update(deployments).set({ state: 'failed', finishedAt: now }).where(eq(deployments.id, id));
  }
}
