import 'server-only';

import { type DatabaseTarget, lookupDatabase } from '@/lib/databases-db';

/** A Postgres database that is ready to be queried, or the response that says why not. */
export async function readyPostgres(slug: string, name: string): Promise<DatabaseTarget | Response> {
  const row = await lookupDatabase(slug, name);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  if (row.kind !== 'postgres') return Response.json({ error: 'Only Postgres databases can be browsed.' }, { status: 400 });
  if (row.state !== 'ready') return Response.json({ error: 'The database is not ready yet.' }, { status: 409 });
  return row;
}

/** Postgres error text for the user: its message only, never the connection details. */
export const dbError = (e: unknown) => (e instanceof Error ? e.message : 'Query failed');
