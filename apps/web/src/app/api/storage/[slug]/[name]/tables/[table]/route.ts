import { listTables, tablePage, withProjectDb } from '@gust/db/project-db';

import { requireUser } from '@/lib/auth';
import { dbError, readyPostgres } from '../../guard';

type Ctx = { params: Promise<{ slug: string; name: string; table: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const { slug, name, table } = await params;
  const row = await readyPostgres(slug, name);
  if (row instanceof Response) return row;
  const page = Number(new URL(req.url).searchParams.get('page') ?? 0);
  if (!Number.isInteger(page) || page < 0 || page > 100_000) return Response.json({ error: 'Invalid page' }, { status: 400 });
  try {
    const out = await withProjectDb(row, { readOnly: true }, async (client) => {
      // The name from the URL is only used when it is one of the database's own tables.
      const { tables } = await listTables(client);
      if (!tables.some((t) => t.name === table)) return null;
      return tablePage(client, table, page);
    });
    if (!out) return Response.json({ error: 'No such table' }, { status: 404 });
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: dbError(e) }, { status: 502 });
  }
}
