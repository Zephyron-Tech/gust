import { engineFetch } from '@/lib/engine-server';

export async function GET() {
  const res = await engineFetch('/v1/containers').catch(() => null);
  if (!res?.ok) return Response.json({ error: 'engine unreachable' }, { status: 502 });
  return Response.json(await res.json());
}
