import { auditEvents, db } from '@gust/db';

import { requireUser } from '@/lib/auth';
import { requestUpdate } from '@/lib/system-update';

export const dynamic = 'force-dynamic';

// Asks the host to look for a newer image now instead of waiting for the timer.
export async function POST(req: Request) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const result = await requestUpdate('check');
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  await db.insert(auditEvents).values({
    actor: u.email,
    action: 'system.update.check',
    target: 'gust',
    detail: null,
  });
  return Response.json({ ok: true }, { status: 202 });
}
