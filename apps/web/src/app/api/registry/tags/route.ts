// Deletes one image from the registry by its digest. Admins only, with an audit row. Every tag on
// that digest goes with it, and a rollback to one of them stops working.
import { auditEvents, db } from '@gust/db';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { deleteManifest } from '@/lib/registry';

const body = z.object({
  repo: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,39}\/[a-z0-9][a-z0-9._-]{0,39}$/),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

export async function DELETE(req: Request) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Not a repository and digest' }, { status: 400 });
  const { repo, digest } = parsed.data;

  const result = await deleteManifest(repo, digest);
  if (result === 'not-found') return Response.json({ error: 'The image is already gone' }, { status: 404 });
  if (result === 'failed') return Response.json({ error: 'The registry did not delete it. Try again.' }, { status: 502 });

  await db.insert(auditEvents).values({
    actor: u.email,
    action: 'registry.tag.delete',
    target: repo,
    detail: { digest },
  });
  return Response.json({ deleted: true });
}
