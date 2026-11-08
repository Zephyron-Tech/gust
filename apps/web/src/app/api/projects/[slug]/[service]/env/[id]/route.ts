import { requireUser } from '@/lib/auth';
import { getServiceRow } from '@/lib/data';
import { deleteEnv } from '@/lib/env-db';

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; service: string; id: string }> }) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug, service, id } = await params;
  const row = await getServiceRow(slug, service);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  const ok = await deleteEnv(row.s.id, id, `${slug}/${service}`, u.email);
  return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 });
}
