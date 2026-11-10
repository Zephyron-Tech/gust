// Creates a project's database on the shared Postgres cluster. Runs the
// statements from @gust/db/postgres-admin as the cluster admin, one at a time,
// and undoes what it made if a later step fails, so a retry starts clean.
import { db, pool, projectDatabases } from '@gust/db';
import { createStatements, dropStatements } from '@gust/db/postgres-admin';
import { decryptSecret } from '@gust/db/secrets';
import { eq } from 'drizzle-orm';

export async function provisionDatabase(id: string, log: (line: string) => void) {
  const [row] = await db.select().from(projectDatabases).where(eq(projectDatabases.id, id));
  if (row?.state !== 'provisioning') return;
  const plan = { database: row.database, role: row.role };
  const statements = createStatements(plan, decryptSecret(row.passwordEncrypted));

  // Count what succeeded: 1 means the role exists, 2 or more means the database does too.
  let made = 0;
  try {
    for (const sql of statements) {
      await pool.query(sql);
      made++;
    }
    await db.update(projectDatabases).set({ state: 'ready', error: null }).where(eq(projectDatabases.id, id));
    log(`database ${plan.database} ready`);
  } catch (e) {
    const message = (e as Error).message;
    const [dropDatabase, dropRole] = dropStatements(plan);
    if (made >= 2 && dropDatabase) await pool.query(dropDatabase).catch(() => {});
    if (made >= 1 && dropRole) await pool.query(dropRole).catch(() => {});
    await db.update(projectDatabases).set({ state: 'failed', error: message }).where(eq(projectDatabases.id, id));
    log(`database ${plan.database} failed: ${message}`);
  }
}
