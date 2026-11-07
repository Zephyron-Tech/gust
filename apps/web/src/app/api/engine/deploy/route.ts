import { projects } from '@gust/contracts/sample';
import { z } from 'zod';

import { engineFetch, registryHost, sse } from '@/lib/engine-server';

const body = z.object({
  deploymentId: z.string().regex(/^dpl_[a-z0-9]+$/),
  project: z.string(),
  service: z.string(),
  tag: z.string().regex(/^[\w][\w.-]{0,127}$/),
});

// Starts a real deploy. The browser names the service and a tag; the image,
// port, health path and domains come from the service's own settings, never
// from the request.
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const { deploymentId, project, service, tag } = parsed.data;
  const p = projects.find((x) => x.slug === project && x.engine);
  const s = p?.services.find((x) => x.name === service && x.type === 'app');
  if (!p || !s?.port) return Response.json({ error: 'This service is not deployed through the engine' }, { status: 404 });

  const res = await engineFetch('/v1/deployments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      deploymentId,
      project,
      service,
      image: `${registryHost()}/${s.image}:${tag}`,
      port: s.port,
      healthPath: s.healthPath ?? '/',
      domains: s.domains ?? [],
      cpu: s.cpu,
      memoryMb: s.memoryMb,
      healthTimeout: 20,
      env: { STARTUP_DELAY_MS: '1500' },
    }),
  }).catch(() => null);
  if (!res?.ok) return Response.json({ error: 'The engine is not reachable. Is `pnpm dev:engine` running?' }, { status: 502 });
  return sse(res.body);
}
