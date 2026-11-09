import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { getServiceRow } from '@/lib/data';
import { addDomain, DomainError, listDomains } from '@/lib/domains-db';

type Ctx = { params: Promise<{ slug: string; service: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const { slug, service } = await params;
  const row = await getServiceRow(slug, service);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(await listDomains(row));
}

const body = z.object({ host: z.string().min(1).max(253) });

// Admins only. The worker takes it from here: DNS, then a deploy, then HTTPS.
export async function POST(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug, service } = await params;
  const row = await getServiceRow(slug, service);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!row.p.engine || row.s.type !== 'app')
    return Response.json({ error: 'Only app services on the engine take domains' }, { status: 409 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a hostname' }, { status: 400 });
  try {
    const host = await addDomain(row, parsed.data.host, u.email);
    return Response.json({ host }, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
