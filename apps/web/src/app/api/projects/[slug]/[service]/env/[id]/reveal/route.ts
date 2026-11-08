import { requireUser } from '@/lib/auth';
import { getServiceRow } from '@/lib/data';
import { revealEnv } from '@/lib/env-db';

// POST, not GET: revealing a secret is an action that is written to the audit
// log, and must not happen from a prefetch or a cached link.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; service: string; id: string }> }) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug, service, id } = await params;
  const row = await getServiceRow(slug, service);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  const value = await revealEnv(row.s.id, id, `${slug}/${service}`, u.email);
  if (value === null) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ value }, { headers: { 'cache-control': 'no-store' } });
}
