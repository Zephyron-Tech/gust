import { envScope } from '@gust/contracts';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { getServiceRow } from '@/lib/data';
import { deleteEnv, updateEnv } from '@/lib/env-db';

type Ctx = { params: Promise<{ slug: string; service: string; id: string }> };

const body = z.object({
  /** Omitted or empty keeps the stored value. */
  value: z.string().max(8192).optional(),
  scope: envScope,
  isSecret: z.boolean(),
});

const problems = {
  'not-found': ['Not found', 404],
  taken: ['This key already has a value for that environment. Edit or delete that one.', 409],
  'value-needed': ['Enter a value.', 400],
} as const;

// Admins only: change the value, the secret flag or where the variable applies.
export async function PUT(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug, service, id } = await params;
  const row = await getServiceRow(slug, service);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const result = await updateEnv(row.s.id, id, `${slug}/${service}`, u.email, parsed.data);
  if (result === 'ok') return Response.json({ ok: true });
  const [error, status] = problems[result];
  return Response.json({ error }, { status });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug, service, id } = await params;
  const row = await getServiceRow(slug, service);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  const ok = await deleteEnv(row.s.id, id, `${slug}/${service}`, u.email);
  return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 });
}
