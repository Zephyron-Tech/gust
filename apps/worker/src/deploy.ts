// Runs one deploy: calls the engine, stores every event as a log line and
// moves the deployment's state along. The only place that changes a
// deployment after it was queued.
import { branchLabel, pickEnv, previewHost } from '@gust/contracts';
import { db, deploymentLogs, deployments, envVars, projects, services } from '@gust/db';
import { decryptSecret } from '@gust/db/secrets';
import { and, eq, isNull, ne } from 'drizzle-orm';

import { engineFetch } from './engine';
import { type CommitState, setCommitStatus } from './github';
import { deployFailedText, notifyDiscord } from './notify';

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
    await notifyDiscord(deployFailedText(p.slug, svc.name, d.tag, error));
  };

  // A preview gets its own host under the wildcard and its own env scope.
  const branch = d.branch ? branchLabel(d.branch) : undefined;
  let domains = svc.domains;
  if (d.branch) {
    const domain = process.env.GUST_DOMAIN;
    if (!domain) return fail('GUST_DOMAIN is not set on the worker, so the preview has no host.');
    domains = [previewHost(d.branch, p.slug, domain)];
    await log('route', `Preview host https://${domains[0]}`);
  }

  // Env of the service for this deploy's scope; secrets are decrypted only here,
  // on their way to the engine, and never logged.
  // Shared (`all`) rows plus this environment's own, which win on the same key.
  const vars = pickEnv(await db.select().from(envVars).where(eq(envVars.serviceId, svc.id)), d.branch ? 'preview' : 'production');
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
      domains,
      cpu: svc.cpu,
      memoryMb: svc.memoryMb,
      healthTimeout: 30,
      env,
      ...(branch && { branch }),
    }),
  }).catch(() => null);
  if (!res?.ok || !res.body) return fail('The engine did not answer. Is it running?');

  const decoder = new TextDecoder();
  let buf = '';
  let ok = false;
  try {
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
  } catch (e) {
    // The engine went away mid-deploy (restart, crash). Without this the row
    // would stay "starting" until the worker itself restarts.
    return fail(`Lost the engine during the deploy: ${(e as Error).message.split('\n')[0]?.slice(0, 200)}`);
  }

  const now = new Date();
  if (!ok) {
    const [last] = await db.select({ error: deployments.error }).from(deployments).where(eq(deployments.id, id));
    // The engine names the reason in a fail event; a stream that ended without one still needs a reason to show.
    const error = last?.error ?? 'The engine ended the deploy without a result. See: gust logs engine';
    await db.update(deployments).set({ state: 'failed', error, finishedAt: now }).where(eq(deployments.id, id));
    await report('failure', error);
    await notifyDiscord(deployFailedText(p.slug, svc.name, d.tag, error));
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(deployments).set({ state: 'live', liveAt: now, finishedAt: now }).where(eq(deployments.id, id));
    await tx
      .update(deployments)
      .set({ state: 'superseded' })
      .where(
        and(
          eq(deployments.serviceId, svc.id),
          eq(deployments.state, 'live'),
          ne(deployments.id, id),
          d.branch ? eq(deployments.branch, d.branch) : isNull(deployments.branch),
        ),
      );
  });
  await report('success');
}
