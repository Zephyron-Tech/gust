import { auditEvents, db } from '@gust/db';

import { requireUser } from '@/lib/auth';
import { requestUpdate } from '@/lib/system-update';

export const dynamic = 'force-dynamic';

// Asks the host to look for a newer image now instead of waiting for the timer.
// `{ "auto": true }` is the background check the sidebar sends on page load; it
// is not an action a person took, so it writes no audit row.
export async function POST(req: Request) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const body = (await req.json().catch(() => null)) as { auto?: unknown } | null;
  const result = await requestUpdate('check');
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  if (body?.auto !== true) {
    await db.insert(auditEvents).values({
      actor: u.email,
      action: 'system.update.check',
      target: 'gust',
      detail: null,
    });
  }
  return Response.json({ ok: true }, { status: 202 });
}
