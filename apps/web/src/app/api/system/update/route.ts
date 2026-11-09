import { auditEvents, db } from '@gust/db';

import { requireUser } from '@/lib/auth';
import { readUpdateStatus, requestUpdate } from '@/lib/system-update';

export const dynamic = 'force-dynamic';

// Status for every signed-in user; the log is shown to admins only.
export async function GET(req: Request) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const admin = u.role === 'admin';
  return Response.json({ ...(await readUpdateStatus(admin)), canManage: admin });
}

// Installs the newer image. Admins only; the host backs up the database first.
export async function POST(req: Request) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const before = await readUpdateStatus(false);
  const result = await requestUpdate('install');
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  await db.insert(auditEvents).values({
    actor: u.email,
    action: 'system.update.request',
    target: 'gust',
    detail: { kind: 'install', current: before.current, latest: before.latest },
  });
  return Response.json({ ok: true }, { status: 202 });
}
