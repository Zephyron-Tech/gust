import 'server-only';

import { db, projectDatabases, projects } from '@gust/db';
import { enqueueDatabase } from '@gust/db/queue';
import { and, eq } from 'drizzle-orm';

import { requireUser } from '@/lib/auth';

type Ctx = { params: Promise<{ slug: string; id: string }> };

// Admins only. Queues a dump of one ready database; the worker writes it and records it in the audit log.
export async function POST(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug, id } = await params;
  const [row] = await db
    .select({ state: projectDatabases.state })
    .from(projectDatabases)
    .innerJoin(projects, eq(projects.id, projectDatabases.projectId))
    .where(and(eq(projects.slug, slug), eq(projectDatabases.id, id)));
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  if (row.state !== 'ready') return Response.json({ error: 'Only a ready database can be backed up' }, { status: 409 });
  try {
    await enqueueDatabase(id, 'backup');
  } catch {
    return Response.json({ error: 'Could not reach the worker queue. Try again.' }, { status: 503 });
  }
  return Response.json({ state: 'queued' }, { status: 202 });
}
