// Engine API. Internal only: on the VPS it listens on gust_internal and every
// call carries the shared ENGINE_TOKEN.
import { deploySpec, LABEL } from '@gust/contracts';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { streamSSE } from 'hono/streaming';

import { deploy } from './deploy';
import { docker } from './docker';
import { traefikConfig } from './routing';

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
    const result = await deploy(parsed.data, (e) => {
      void stream.writeSSE({ event: 'deploy', data: JSON.stringify({ ts: new Date().toISOString(), ...e }) });
    });
    await stream.writeSSE({ event: 'done', data: JSON.stringify(result) });
  });
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

app.post('/v1/containers/:id/stop', async (c) => {
  await docker.getContainer(c.req.param('id')).stop({ t: 15 });
  return c.json({ ok: true });
});

// Live logs of a container as SSE. Docker multiplexes stdout and stderr into
// frames with an 8-byte header; demux splits them back into lines.
app.get('/v1/containers/:id/logs', (c) =>
  streamSSE(c, async (stream) => {
    const container = docker.getContainer(c.req.param('id'));
    const raw = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: Number(c.req.query('tail') ?? 200),
      timestamps: true,
    });
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
  }),
);

const port = Number(process.env.PORT ?? 4100);
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, () => {
  console.log(`gust engine on http://127.0.0.1:${port}`);
});
