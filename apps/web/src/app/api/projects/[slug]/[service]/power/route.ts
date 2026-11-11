import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { DeployError } from '@/lib/deploy-runner';
import { startService, stopService } from '@/lib/service-power';

const body = z.object({ action: z.enum(['stop', 'start']), target: z.enum(['production', 'previews']).default('production') });

/** Stops or starts one service: its production, or its previews. Admins only. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; service: string }> }) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const { slug, service } = await params;
  try {
    if (parsed.data.action === 'stop') {
      const r = await stopService(slug, service, parsed.data.target, u.email);
      return Response.json({ ok: true, ...r });
    }
    await startService(slug, service, parsed.data.target, u.email, u.name);
    return Response.json({ ok: true }, { status: 202 });
  } catch (e) {
    if (e instanceof DeployError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
