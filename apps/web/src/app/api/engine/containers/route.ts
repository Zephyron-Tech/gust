import { requireUser } from '@/lib/auth';
import { engineFetch } from '@/lib/engine-server';

export async function GET(req: Request) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const res = await engineFetch('/v1/containers').catch(() => null);
  if (!res?.ok) return Response.json({ error: 'engine unreachable' }, { status: 502 });
  return Response.json(await res.json());
}
