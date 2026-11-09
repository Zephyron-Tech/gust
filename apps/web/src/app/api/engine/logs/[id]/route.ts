import { requireUser } from '@/lib/auth';
import { engineFetch, sse } from '@/lib/engine-server';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const { id } = await params;
  if (!/^[a-f0-9]{12,64}$/.test(id)) return Response.json({ error: 'Invalid container id' }, { status: 400 });
  // Gives up if the engine does not answer at all. The timer stops once the
  // headers arrive, so a long-running log stream is not cut off.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 10_000);
  const res = await engineFetch(`/v1/containers/${id}/logs?tail=100`, {
    signal: AbortSignal.any([req.signal, timeout.signal]),
  })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  if (!res?.ok) return Response.json({ error: 'engine unreachable' }, { status: 502 });
  return sse(res.body);
}
