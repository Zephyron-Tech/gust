import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { DeployError } from '@/lib/deploy-runner';
import { projectServices, startService, stopService } from '@/lib/service-power';

const body = z.object({ action: z.enum(['stop', 'start']) });

/** Stops or starts every app service of a project. Admins only. A service that cannot move is reported, the others still do. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const { slug } = await params;
  const list = await projectServices(slug);
  if (!list) return Response.json({ error: 'Not found' }, { status: 404 });

  const failed: { service: string; error: string }[] = [];
  for (const { name } of list) {
    try {
      if (parsed.data.action === 'stop') await stopService(slug, name, u.email);
      else await startService(slug, name, u.email, u.name);
    } catch (e) {
      failed.push({ service: name, error: e instanceof DeployError ? e.message : 'Unexpected error' });
    }
  }
  return Response.json({ ok: failed.length === 0, failed }, { status: failed.length && failed.length === list.length ? 409 : 200 });
}
