import { envScope } from '@gust/contracts';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { getServiceRow } from '@/lib/data';
import { envStaleness, listEnv, setEnvMany } from '@/lib/env-db';

type Ctx = { params: Promise<{ slug: string; service: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const { slug, service } = await params;
  const row = await getServiceRow(slug, service);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  const [rows, stale] = await Promise.all([listEnv(row.s.id), envStaleness(row.s.id, `${slug}/${service}`)]);
  return Response.json({ rows, stale });
}

const key = z.string().regex(/^[A-Z_][A-Z0-9_]{0,127}$/, 'Use capitals, digits and underscores, e.g. DATABASE_URL');
const value = z.string().max(8192);
const single = z.object({ key, value, scope: envScope, isSecret: z.boolean() });
// Several at once, e.g. a pasted .env block: they share the environment and the secret flag.
const many = z.object({
  vars: z.array(z.object({ key, value })).min(1).max(100),
  scope: envScope,
  isSecret: z.boolean(),
});

// Admins only: members may see the list but not change it.
export async function POST(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug, service } = await params;
  const row = await getServiceRow(slug, service);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  const json = await req.json().catch(() => null);
  const parsed = (json && typeof json === 'object' && 'vars' in json ? many : single).safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const at = issue?.path[0] === 'vars' ? (json as { vars: { key?: unknown }[] }).vars[Number(issue.path[1])]?.key : undefined;
    return Response.json({ error: `${at ? `${String(at)}: ` : ''}${issue?.message ?? 'Invalid request'}` }, { status: 400 });
  }
  const d = parsed.data;
  const vars = 'vars' in d ? d.vars.map((v) => ({ ...v, scope: d.scope, isSecret: d.isSecret })) : [d];
  await setEnvMany(row.s.id, `${slug}/${service}`, u.email, vars);
  return Response.json({ ok: true, saved: vars.length });
}
