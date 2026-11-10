import 'server-only';

import { auditEvents, db, projectDatabases, projects } from '@gust/db';
import { enqueueDatabase } from '@gust/db/queue';
import { and, eq } from 'drizzle-orm';

import { requireUser } from '@/lib/auth';

type Ctx = { params: Promise<{ slug: string; id: string }> };

// Admins only. Marks the database as deleting and queues the drop; the worker removes it
// and the env variable that pointed at it.
export async function DELETE(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug, id } = await params;
  const [row] = await db
    .select({ id: projectDatabases.id, name: projectDatabases.name, database: projectDatabases.database, state: projectDatabases.state })
    .from(projectDatabases)
    .innerJoin(projects, eq(projects.id, projectDatabases.projectId))
    .where(and(eq(projects.slug, slug), eq(projectDatabases.id, id)));
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  if (row.state === 'provisioning') return Response.json({ error: 'It is still being created. Wait for it to finish.' }, { status: 409 });
  if (row.state === 'deleting') return Response.json({ state: 'deleting' }, { status: 202 });

  await db.transaction(async (tx) => {
    await tx.update(projectDatabases).set({ state: 'deleting', error: null }).where(eq(projectDatabases.id, id));
    await tx.insert(auditEvents).values({
      actor: u.email,
      action: 'database.delete',
      target: `project:${slug}`,
      detail: { name: row.name, database: row.database },
    });
  });
  try {
    await enqueueDatabase(id, 'drop');
  } catch {
    return Response.json({ error: 'Could not reach the worker queue. Try again.' }, { status: 503 });
  }
  return Response.json({ state: 'deleting' }, { status: 202 });
}
