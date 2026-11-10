import 'server-only';

import { db, projectDatabases } from '@gust/db';
import { eq } from 'drizzle-orm';

/** Marks a database row failed with a message the user can read in the list. */
export async function markFailed(id: string, error: string) {
  await db.update(projectDatabases).set({ state: 'failed', error }).where(eq(projectDatabases.id, id));
}
