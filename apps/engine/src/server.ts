// Engine API. Internal only: on the VPS it listens on gust_internal and every
// call carries the shared ENGINE_TOKEN.
import { deploySpec, LABEL } from '@gust/contracts';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { streamSSE } from 'hono/streaming';
import { prune, usage } from './cleanup';
import { deploy } from './deploy';
import { docker } from './docker';
import { listObserved, restartObserved, STACK_NAME } from './observed';
import { reloadRegistry } from './registry';
import { traefikConfig } from './routing';
import { removeBranch, stopService } from './service-control';

const token = process.env.ENGINE_TOKEN;
if (!token) throw new Error('ENGINE_TOKEN is not set');

export const app = new Hono();

app.get('/v1/health', async (c) => {
  const dockerOk = await docker.ping().then(
    () => true,
    () => false,
  );
  return c.json({ ok: dockerOk, docker: dockerOk }, dockerOk ? 200 : 503);
});

app.use('/v1/*', bearerAuth({ token }));
app.use('/internal/*', bearerAuth({ token }));

// Polled by Traefik's HTTP provider every second.
app.get('/internal/traefik', async (c) => c.json(await traefikConfig()));

// Starts a deploy and streams its events as SSE until it is live or failed.
app.post('/v1/deployments', async (c) => {
  const parsed = deploySpec.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
  return streamSSE(c, async (stream) => {
    const emit = (e: Parameters<Parameters<typeof deploy>[1]>[0]) => {
      void stream.writeSSE({ event: 'deploy', data: JSON.stringify({ ts: new Date().toISOString(), ...e }) });
    };
    // A Docker error mid-deploy (bad image config, no memory) must reach the
    // deployment's log as the reason, not end the stream without a word.
    const result = await deploy(parsed.data, emit).catch((e: Error) => {
      console.error(`${new Date().toISOString()} deploy ${parsed.data.deploymentId}: ${e.message}`);
      emit({
        phase: 'fail',
        state: 'failed',
        line: `The engine could not start the container: ${e.message.split('\n')[0]?.slice(0, 300)}`,
      });
      return { ok: false };
    });
    await stream.writeSSE({ event: 'done', data: JSON.stringify(result) });
  });
});

// Compose stacks on the host that Gust only observes (see observed.ts).
app.get('/v1/observed', async (c) => c.json(await listObserved()));

app.post('/v1/observed/:project/restart', async (c) => {
  const project = c.req.param('project');
  if (!STACK_NAME.test(project)) return c.json({ error: 'Not an observed stack' }, 404);
  const containers = await restartObserved(project);
  if (!containers) return c.json({ error: 'Not an observed stack' }, 404);
  return c.json({ ok: true, containers });
});

// Stops a service by hand: its running containers in the scope (production, previews or all).
app.post('/v1/services/:project/:service/stop', async (c) => {
  const { project, service } = c.req.param();
  if (!/^[a-z0-9-]+$/.test(project) || !/^[a-z0-9-]+$/.test(service)) return c.json({ error: 'Invalid name' }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { scope?: string };
  const scope = body.scope === 'production' || body.scope === 'previews' ? body.scope : 'all';
  return c.json({ ok: true, containers: await stopService(project, service, scope) });
});

// Removes one preview branch (a closed or evicted pull request): containers stopped and deleted.
app.post('/v1/services/:project/:service/remove-branch', async (c) => {
  const { project, service } = c.req.param();
  if (!/^[a-z0-9-]+$/.test(project) || !/^[a-z0-9-]+$/.test(service)) return c.json({ error: 'Invalid name' }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { branch?: unknown };
  // Only pull request previews are removed this way: production and branch names never match.
  if (typeof body.branch !== 'string' || !/^pr-[1-9]\d{0,8}$/.test(body.branch))
    return c.json({ error: 'Not a pull request preview' }, 400);
  return c.json({ ok: true, containers: await removeBranch(project, service, body.branch) });
});

// The worker calls this after Zot's accounts change; Zot reads its login file only at start.
app.post('/v1/registry/reload', async (c) => c.json(await reloadRegistry()));

// Host disk: what cleanup would remove, and the cleanup itself.
app.get('/v1/cleanup', async (c) => c.json(await usage()));
app.post('/v1/cleanup', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { images?: unknown; containers?: unknown } | null;
  return c.json(await prune({ images: body?.images === true, containers: body?.containers === true }));
});

// Containers Gust manages, with their project, service and deployment.
app.get('/v1/containers', async (c) => {
  const list = await docker.listContainers({ all: true, filters: { label: [`${LABEL.managed}=true`] } });
  return c.json(
    list.map((x) => ({
      id: x.Id,
      name: x.Names[0]?.slice(1),
      image: x.Image,
      state: x.State,
      status: x.Status,
      project: x.Labels[LABEL.project],
      service: x.Labels[LABEL.service],
      deployment: x.Labels[LABEL.deployment],
    })),
  );
});

/**
 * The container behind an id, only when Gust manages it. The engine's token
 * must never reach other containers on the host (Postgres, Traefik, the
 * registry): their logs hold secrets and stopping them takes Gust down.
 */
async function managed(id: string) {
  if (!/^[a-f0-9]{12,64}$/.test(id)) return null;
  const container = docker.getContainer(id);
  const info = await container.inspect().catch(() => null);
  return info?.Config.Labels?.[LABEL.managed] === 'true' ? container : null;
}

app.post('/v1/containers/:id/stop', async (c) => {
  const container = await managed(c.req.param('id'));
  if (!container) return c.json({ error: 'Not a container Gust manages' }, 404);
  await container.stop({ t: 15 });
  return c.json({ ok: true });
});

// Removes a container, stopping it first if it runs. Volumes stay: stateful data
// is kept until someone removes it on purpose.
app.delete('/v1/containers/:id', async (c) => {
  const container = await managed(c.req.param('id'));
  if (!container) return c.json({ error: 'Not a container Gust manages' }, 404);
  await container.remove({ force: true, v: false });
  return c.json({ ok: true });
});

// Live logs of a container as SSE. Docker multiplexes stdout and stderr into
// frames with an 8-byte header; demux splits them back into lines.
app.get('/v1/containers/:id/logs', async (c) => {
  const container = await managed(c.req.param('id'));
  if (!container) return c.json({ error: 'Not a container Gust manages' }, 404);
  const asked = Number(c.req.query('tail') ?? 200);
  const tail = Number.isInteger(asked) ? Math.min(Math.max(asked, 0), 2000) : 200;
  return streamSSE(c, async (stream) => {
    const raw = await container.logs({ follow: true, stdout: true, stderr: true, tail, timestamps: true });
    const { PassThrough } = await import('node:stream');
    const out = new PassThrough();
    docker.modem.demuxStream(raw, out, out);
    let buf = '';
    out.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) void stream.writeSSE({ event: 'log', data: line });
    });
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        (raw as unknown as { destroy: () => void }).destroy();
        resolve();
      });
      raw.on('end', () => resolve());
    });
  });
});

// Docker errors carry request details; the caller gets a short reason, the log the rest.
app.onError((err, c) => {
  console.error(`${new Date().toISOString()} ${c.req.method} ${c.req.path}: ${err.message}`);
  return c.json({ error: 'The engine could not do this. See the engine log.' }, 500);
});

const port = Number(process.env.PORT ?? 4100);
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, () => {
  console.log(`gust engine on http://127.0.0.1:${port}`);
});
