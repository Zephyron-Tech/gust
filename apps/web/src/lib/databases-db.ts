import 'server-only';

import { auditEvents, db, projectDatabases, projects } from '@gust/db';
import { normalizeName, planFor, randomPassword } from '@gust/db/postgres-admin';
import { encryptSecret } from '@gust/db/secrets';
import { and, desc, eq, sql } from 'drizzle-orm';

export type DatabaseRow = {
  id: string;
  name: string;
  database: string;
  state: 'provisioning' | 'ready' | 'failed' | 'deleting';
  error: string | null;
  createdAt: Date;
};

export type BackupRow = { at: Date; name: string; database: string; file: string };

/** A project's databases and its recent backups. Never includes a password. */
export async function listProjectDatabases(slug: string): Promise<{ databases: DatabaseRow[]; backups: BackupRow[] }> {
  const databases = await db
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
    .where(eq(projects.slug, slug))
    .orderBy(projectDatabases.createdAt);

  const rows = await db
    .select({ at: auditEvents.at, detail: auditEvents.detail })
    .from(auditEvents)
    .where(and(eq(auditEvents.target, `project:${slug}`), eq(auditEvents.action, 'database.backup')))
    .orderBy(desc(auditEvents.at))
    .limit(20);

  const backups = rows.map((r) => {
    const d = (r.detail ?? {}) as { name?: string; database?: string; file?: string };
    return { at: r.at, name: d.name ?? '', database: d.database ?? '', file: (d.file ?? '').split('/').pop() ?? '' };
  });
  return { databases, backups };
}

export class DuplicateDatabase extends Error {}

/**
 * Inserts a new database row and its audit row in one transaction. The worker
 * creates the database itself; the caller queues the job. Throws DuplicateDatabase
 * on a name clash and the planFor error for a bad name.
 */
export async function insertDatabaseRow(opts: {
  projectId: string;
  slug: string;
  name: string;
  actor: string;
  action: 'database.create' | 'database.restore';
  detail?: Record<string, unknown>;
}): Promise<{ id: string; name: string; database: string }> {
  const plan = planFor(opts.slug, opts.name);
  const name = normalizeName(opts.name);
  const id = `pdb_${plan.database}`;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(projectDatabases).values({
        id,
        projectId: opts.projectId,
        name,
        database: plan.database,
        role: plan.role,
        passwordEncrypted: encryptSecret(randomPassword()),
      });
      await tx.insert(auditEvents).values({
        actor: opts.actor,
        action: opts.action,
        target: `project:${opts.slug}`,
        detail: { name, database: plan.database, ...opts.detail },
      });
    });
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === '23505') throw new DuplicateDatabase('A database with this name already exists');
    throw e;
  }
  return { id, name, database: plan.database };
}

export type StorageRow = {
  slug: string;
  name: string;
  database: string;
  state: DatabaseRow['state'];
  error: string | null;
  createdAt: Date;
  lastBackup: Date | null;
};

/** Every project's databases, grouped by project and oldest first, for the Storage page. Never includes a password. */
export async function listAllDatabases(): Promise<StorageRow[]> {
  const rows = await db
    .select({
      slug: projects.slug,
      name: projectDatabases.name,
      database: projectDatabases.database,
      state: projectDatabases.state,
      error: projectDatabases.error,
      createdAt: projectDatabases.createdAt,
    })
    .from(projectDatabases)
    .innerJoin(projects, eq(projects.id, projectDatabases.projectId))
    .orderBy(projects.slug, projectDatabases.createdAt);

  const backups = await db
    .select({ target: auditEvents.target, last: sql<string | null>`max(${auditEvents.at})` })
    .from(auditEvents)
    .where(eq(auditEvents.action, 'database.backup'))
    .groupBy(auditEvents.target);
  // Raw SQL aggregates come back as text, not as Date.
  const last = new Map(backups.map((b) => [b.target, b.last ? new Date(b.last) : null]));

  return rows.map((r) => ({ ...r, lastBackup: last.get(`project:${r.slug}`) ?? null }));
}
