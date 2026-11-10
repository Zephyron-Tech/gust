import { auditEvents, db } from '@gust/db';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { engineFetch } from '@/lib/engine-server';

export async function GET(req: Request) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const res = await engineFetch('/v1/cleanup').catch(() => null);
  if (!res?.ok) return Response.json({ error: 'engine unreachable' }, { status: 502 });
  return Response.json(await res.json());
}

const body = z.object({ images: z.boolean(), containers: z.boolean() }).refine((b) => b.images || b.containers, 'Pick something to remove');

/** Removes unused images and stopped Gust containers. Admins only; each run is audited. */
export async function POST(req: Request) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Pick something to remove' }, { status: 400 });
  const res = await engineFetch('/v1/cleanup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed.data),
  }).catch(() => null);
  if (!res?.ok) return Response.json({ error: 'engine unreachable' }, { status: 502 });
  const result = (await res.json()) as { imagesDeleted: number; containersDeleted: number; spaceReclaimedMb: number };
  await db.insert(auditEvents).values({ actor: u.email, action: 'system.cleanup', target: 'host', detail: { ...parsed.data, ...result } });
  return Response.json(result);
}
