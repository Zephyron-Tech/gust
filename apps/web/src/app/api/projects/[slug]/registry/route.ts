// A project's registry account: create, rotate or revoke. Admins only. Create and rotate go to the
// worker, which writes the GitHub secrets; the password is never sent back to the browser.
import { enqueueRegistry } from '@gust/db/queue';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';

const body = z.object({ action: z.enum(['create', 'rotate', 'revoke']) });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug)) return Response.json({ error: 'Not a project' }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Choose create, rotate or revoke' }, { status: 400 });

  // Revoke also goes to the worker, which sets the flag and syncs Zot.
  await enqueueRegistry({ slug, action: parsed.data.action, actor: u.email });
  return Response.json({ queued: true }, { status: 202 });
}
