import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { getServiceRow } from '@/lib/data';
import { envStaleness, listEnv, setEnv } from '@/lib/env-db';

type Ctx = { params: Promise<{ slug: string; service: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const { slug, service } = await params;
  const row = await getServiceRow(slug, service);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  const [rows, status] = await Promise.all([listEnv(row.s.id), envStaleness(row.s.id, `${slug}/${service}`)]);
  return Response.json({ rows, ...status });
}

const body = z.object({
  key: z.string().regex(/^[A-Z_][A-Z0-9_]{0,127}$/, 'Use capitals, digits and underscores, e.g. DATABASE_URL'),
  value: z.string().max(8192),
  scope: z.enum(['production', 'preview']),
  isSecret: z.boolean(),
});

// Admins only: members may see the list but not change it.
export async function POST(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug, service } = await params;
  const row = await getServiceRow(slug, service);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  await setEnv(row.s.id, `${slug}/${service}`, u.email, parsed.data);
  return Response.json({ ok: true });
}
