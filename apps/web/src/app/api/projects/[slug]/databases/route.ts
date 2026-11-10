import 'server-only';

import { db, projects } from '@gust/db';
import { enqueueDatabase } from '@gust/db/queue';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { DuplicateDatabase, insertDatabaseRow, listProjectDatabases } from '@/lib/databases-db';
import { markFailed } from './helpers';

type Ctx = { params: Promise<{ slug: string }> };

// Databases a project owns on the shared cluster, and its recent backups. Passwords are never returned.
export async function GET(req: Request, { params }: Ctx) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const { slug } = await params;
  return Response.json(await listProjectDatabases(slug));
}

const body = z.object({ name: z.string().min(1).max(40), kind: z.enum(['postgres', 'redis']).default('postgres') });

// Admins only. Creates the row and queues the job; the worker creates the database.
export async function POST(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug } = await params;
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug));
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a database name' }, { status: 400 });

  let row: { id: string; name: string; database: string };
  try {
    row = await insertDatabaseRow({
      projectId: project.id,
      slug,
      name: parsed.data.name,
      kind: parsed.data.kind,
      actor: u.email,
      action: 'database.create',
    });
  } catch (e) {
    if (e instanceof DuplicateDatabase) return Response.json({ error: e.message }, { status: 409 });
    if (e instanceof Error && !(e as { code?: string }).code) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  try {
    await enqueueDatabase(row.id, 'provision');
  } catch {
    // Without the job the row would wait forever; mark it so the user can delete and try again.
    await markFailed(row.id, 'Could not queue the job. Delete it and create it again.');
    return Response.json({ error: 'Could not reach the worker queue. Try again.' }, { status: 503 });
  }
  return Response.json(
    { id: row.id, name: row.name, database: row.database, kind: parsed.data.kind, state: 'provisioning' },
    { status: 201 },
  );
}
