import 'server-only';

import { auditEvents, db, projectDatabases, projects } from '@gust/db';
import { normalizeName, planFor, randomPassword } from '@gust/db/postgres-admin';
import { enqueueDatabase } from '@gust/db/queue';
import { encryptSecret } from '@gust/db/secrets';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';

type Ctx = { params: Promise<{ slug: string }> };

// Databases a project owns on the shared cluster. Passwords are never returned.
export async function GET(req: Request, { params }: Ctx) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const { slug } = await params;
  const rows = await db
    .select({
      id: projectDatabases.id,
      name: projectDatabases.name,
      database: projectDatabases.database,
      state: projectDatabases.state,
      error: projectDatabases.error,
      createdAt: projectDatabases.createdAt,
    })
    .from(projectDatabases)
    .innerJoin(projects, eq(projects.id, projectDatabases.projectId))
    .where(eq(projects.slug, slug));
  return Response.json(rows);
}

const body = z.object({ name: z.string().min(1).max(40) });

// Admins only. Creates the row and queues the job; the worker creates the database.
export async function POST(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug } = await params;
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug));
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a database name' }, { status: 400 });

  let plan: { database: string; role: string };
  try {
    plan = planFor(slug, parsed.data.name);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  const name = normalizeName(parsed.data.name);
  const id = `pdb_${plan.database}`;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(projectDatabases).values({
        id,
        projectId: project.id,
        name,
        database: plan.database,
        role: plan.role,
        passwordEncrypted: encryptSecret(randomPassword()),
      });
      await tx.insert(auditEvents).values({
        actor: u.email,
        action: 'database.create',
        target: `project:${slug}`,
        detail: { name, database: plan.database },
      });
    });
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === '23505') return Response.json({ error: 'A database with this name already exists' }, { status: 409 });
    throw e;
  }
  await enqueueDatabase(id);
  return Response.json({ id, name, database: plan.database, state: 'provisioning' }, { status: 201 });
}
