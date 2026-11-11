import { listTables, withProjectDb } from '@gust/db/project-db';

import { requireUser } from '@/lib/auth';
import { dbError, readyPostgres } from '../guard';

type Ctx = { params: Promise<{ slug: string; name: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const { slug, name } = await params;
  const row = await readyPostgres(slug, name);
  if (row instanceof Response) return row;
  try {
    return Response.json(await withProjectDb(row, { readOnly: true }, listTables));
  } catch (e) {
    return Response.json({ error: dbError(e) }, { status: 502 });
  }
}
