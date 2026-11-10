import { auditEvents, db } from '@gust/db';

import { requireUser } from '@/lib/auth';
import { engineFetch } from '@/lib/engine-server';

/** Restarts every container of an observed Compose stack. Admins only; the engine refuses anything it does not observe. */
export async function POST(req: Request, { params }: { params: Promise<{ project: string }> }) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { project } = await params;
  const res = await engineFetch(`/v1/observed/${encodeURIComponent(project)}/restart`, { method: 'POST' }).catch(() => null);
  if (!res) return Response.json({ error: 'engine unreachable' }, { status: 502 });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; containers?: string[]; error?: string };
  if (!res.ok) return Response.json({ error: body.error ?? 'Restart failed' }, { status: res.status });
  await db.insert(auditEvents).values({
    actor: u.email,
    action: 'observed.restart',
    target: `observed:${project}`,
    detail: { containers: body.containers ?? [] },
  });
  return Response.json({ ok: true, containers: body.containers ?? [] });
}
