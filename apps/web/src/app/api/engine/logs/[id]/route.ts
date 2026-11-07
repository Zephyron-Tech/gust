import { engineFetch, sse } from '@/lib/engine-server';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{12,64}$/.test(id)) return Response.json({ error: 'Invalid container id' }, { status: 400 });
  const res = await engineFetch(`/v1/containers/${id}/logs?tail=100`, { signal: req.signal }).catch(() => null);
  if (!res?.ok) return Response.json({ error: 'engine unreachable' }, { status: 502 });
  return sse(res.body);
}
