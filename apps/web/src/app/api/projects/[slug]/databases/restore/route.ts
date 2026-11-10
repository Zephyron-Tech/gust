import 'server-only';

import { basename } from 'node:path';
import { auditEvents, db, projects } from '@gust/db';
import { enqueueDatabase } from '@gust/db/queue';
import { redisDumpSuffix } from '@gust/db/redis-admin';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { DuplicateDatabase, insertDatabaseRow } from '@/lib/databases-db';
import { markFailed } from '../helpers';

type Ctx = { params: Promise<{ slug: string }> };

const body = z.object({
  /** File name of a backup, as the list shows it. The full path comes from the audit log, never from the client. */
  file: z.string().min(1).max(200),
  name: z.string().min(1).max(40),
});

// Admins only. Restores a backup of this project into a new database, so nothing existing is overwritten.
export async function POST(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug } = await params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Pick a backup and name the new database' }, { status: 400 });
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug));
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });

  // Only dumps the worker recorded for this project can be restored.
  const backups = await db
    .select({ detail: auditEvents.detail })
    .from(auditEvents)
    .where(and(eq(auditEvents.target, `project:${slug}`), eq(auditEvents.action, 'database.backup')))
    .orderBy(desc(auditEvents.at))
    .limit(200);
  const match = backups
    .map((b) => (b.detail as { file?: string } | null)?.file)
    .find((f): f is string => typeof f === 'string' && basename(f) === parsed.data.file);
  if (!match) return Response.json({ error: 'Backup not found' }, { status: 404 });

  let row: { id: string; name: string; database: string };
  try {
    row = await insertDatabaseRow({
      projectId: project.id,
      slug,
      name: parsed.data.name,
      // A Redis dump restores into a Redis database; anything else is a Postgres dump.
      kind: match.endsWith(redisDumpSuffix) ? 'redis' : 'postgres',
      actor: u.email,
      action: 'database.restore',
      detail: { from: parsed.data.file },
    });
  } catch (e) {
    if (e instanceof DuplicateDatabase) return Response.json({ error: e.message }, { status: 409 });
    if (e instanceof Error && !(e as { code?: string }).code) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  try {
    await enqueueDatabase(row.id, 'restore', match);
  } catch {
    await markFailed(row.id, 'Could not queue the job. Delete it and try the restore again.');
    return Response.json({ error: 'Could not reach the worker queue. Try again.' }, { status: 503 });
  }
  return Response.json({ id: row.id, name: row.name, database: row.database, state: 'provisioning' }, { status: 202 });
}
