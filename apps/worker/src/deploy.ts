// Runs one deploy: calls the engine, stores every event as a log line and
// moves the deployment's state along. The only place that changes a
// deployment after it was queued.
import { db, deploymentLogs, deployments, envVars, projects, services } from '@gust/db';
import { decryptSecret } from '@gust/db/secrets';
import { and, eq, ne } from 'drizzle-orm';

import { engineFetch } from './engine';
import { type CommitState, setCommitStatus } from './github';

const publicUrl = () => (process.env.GUST_PUBLIC_URL ?? 'http://localhost:3100').replace(/\/$/, '');

export async function runDeploy(id: string) {
  const [row] = await db
    .select({ d: deployments, s: services, p: projects })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(eq(deployments.id, id));
  if (!row) throw new Error(`deployment ${id} not found`);
  const { d, s: svc, p } = row;
  if (d.state !== 'queued') return; // already handled

  // Deploys from GitHub Actions report back to their commit.
  const report = (state: CommitState, error?: string | null) =>
    d.trigger === 'push' && d.commitSha && p.githubRepo
      ? setCommitStatus(
          {
            repository: p.githubRepo,
            sha: d.commitSha,
            service: svc.name,
            url: `${publicUrl()}/projects/${p.slug}/${svc.name}/deployments/${id}`,
            error,
          },
          state,
          (line) => console.log(`${new Date().toISOString()} ${line}`),
        )
      : Promise.resolve();
  await report('pending');

  const log = (phase: string, line: string, ts = new Date()) => db.insert(deploymentLogs).values({ deploymentId: id, phase, line, ts });
  const fail = async (error: string) => {
    await log('fail', error);
    await db.update(deployments).set({ state: 'failed', error, finishedAt: new Date() }).where(eq(deployments.id, id));
    await report('failure', error);
  };

  // Production env of the service; secrets are decrypted only here, on their
  // way to the engine, and never logged.
  const vars = await db
    .select()
    .from(envVars)
    .where(and(eq(envVars.serviceId, svc.id), eq(envVars.scope, 'production')));
  let env: Record<string, string>;
  try {
    env = Object.fromEntries(vars.map((v) => [v.key, v.isSecret ? decryptSecret(v.value) : v.value]));
  } catch {
    return fail('A secret could not be decrypted. Is GUST_MASTER_KEY the one it was saved with?');
  }
  await log('queue', `${vars.length} env variable${vars.length === 1 ? '' : 's'} (${vars.filter((v) => v.isSecret).length} secret)`);

  const res = await engineFetch('/v1/deployments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      deploymentId: id,
      project: p.slug,
      service: svc.name,
      image: d.imageRef,
      port: svc.port,
      healthPath: svc.healthPath ?? '/',
      domains: svc.domains,
      cpu: svc.cpu,
      memoryMb: svc.memoryMb,
      healthTimeout: 30,
      env,
    }),
  }).catch(() => null);
  if (!res?.ok || !res.body) return fail('The engine did not answer. Is it running?');

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
  if (!ok) {
    await db.update(deployments).set({ state: 'failed', finishedAt: now }).where(eq(deployments.id, id));
    const [last] = await db.select({ error: deployments.error }).from(deployments).where(eq(deployments.id, id));
    await report('failure', last?.error);
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(deployments).set({ state: 'live', liveAt: now, finishedAt: now }).where(eq(deployments.id, id));
    await tx
      .update(deployments)
      .set({ state: 'superseded' })
      .where(and(eq(deployments.serviceId, svc.id), eq(deployments.state, 'live'), ne(deployments.id, id)));
  });
  await report('success');
}
