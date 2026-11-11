import { auditEvents, db } from '@gust/db';
import { runQuery, withProjectDb } from '@gust/db/project-db';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { dbError, readyPostgres } from '../guard';

type Ctx = { params: Promise<{ slug: string; name: string }> };

const body = z.object({
  sql: z.string().trim().min(1, 'Write a query first').max(20_000, 'The query is too long'),
  write: z.boolean().default(false),
});

// Members may read; changing data needs an admin and `write: true`. A read runs in a READ ONLY
// transaction, so Postgres itself refuses anything that would change data.
export async function POST(req: Request, { params }: Ctx) {
  const write =
    (
      await req
        .clone()
        .json()
        .catch(() => null)
    )?.write === true;
  const u = await requireUser(req, write ? 'admin' : undefined);
  if (u instanceof Response) return u;
  const { slug, name } = await params;
  const row = await readyPostgres(slug, name);
  if (row instanceof Response) return row;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { sql } = parsed.data;

  // The audit names the database and the mode, never the text or the result: both can hold secrets.
  await db.insert(auditEvents).values({
    actor: u.email,
    action: 'database.query',
    target: `project:${slug}`,
    detail: { name: row.name, database: row.database, mode: write ? 'write' : 'read', length: sql.length },
  });
  try {
    return Response.json(await withProjectDb(row, { readOnly: !write }, (client) => runQuery(client, sql)));
  } catch (e) {
    return Response.json({ error: dbError(e) }, { status: 400 });
  }
}
