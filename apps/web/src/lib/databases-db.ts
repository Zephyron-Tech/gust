import 'server-only';

import { auditEvents, db, projectDatabases, projects } from '@gust/db';
import { and, desc, eq } from 'drizzle-orm';

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
