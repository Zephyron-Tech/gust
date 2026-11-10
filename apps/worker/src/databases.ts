// Project databases on the shared Postgres cluster: create, delete, back up, and
// recover what a restart interrupted. Every SQL statement comes from
// @gust/db/postgres-admin and runs as the cluster admin, one at a time.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

import { auditEvents, db, envVars, pool, projectDatabases, projects, services } from '@gust/db';
import { connectionUrl, createStatements, type DbPlan, dropStatements, randomPassword, rotateStatements } from '@gust/db/postgres-admin';
import { enqueueDatabase } from '@gust/db/queue';
import { decryptSecret, encryptSecret } from '@gust/db/secrets';
import { and, eq, inArray } from 'drizzle-orm';

import { expiredDumps, isInside, restoreArgs } from './backup-files';

type Log = (line: string) => void;

/** The env variable an app gets for a database: `DATABASE_URL` for `main`, else `DATABASE_URL_<NAME>`. */
export const envKeyFor = (name: string) => (name === 'main' ? 'DATABASE_URL' : `DATABASE_URL_${name.toUpperCase()}`);

const planOf = (row: { database: string; role: string }): DbPlan => ({ database: row.database, role: row.role });

async function setAppEnv(projectId: string, key: string, value: string | null) {
  const apps = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.projectId, projectId), eq(services.type, 'app')));
  for (const s of apps) {
    if (value === null) {
      await db.delete(envVars).where(and(eq(envVars.serviceId, s.id), eq(envVars.key, key)));
    } else {
      await db
        .insert(envVars)
        .values({
          id: `env_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
          serviceId: s.id,
          key,
          scope: 'all',
          isSecret: true,
          value: encryptSecret(value),
        })
        .onConflictDoUpdate({
          target: [envVars.serviceId, envVars.key, envVars.scope],
          set: { value: encryptSecret(value), isSecret: true, createdAt: new Date() },
        });
    }
  }
}

async function audit(actor: string, action: string, target: string, detail: Record<string, unknown>) {
  await db.insert(auditEvents).values({ actor, action, target, detail });
}

async function projectSlugOf(projectId: string): Promise<string> {
  const [p] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, projectId));
  return p?.slug ?? projectId;
}

/** Creates the database and role, then gives the project's apps the connection URL. */
export async function provisionDatabase(id: string, log: Log) {
  const [row] = await db.select().from(projectDatabases).where(eq(projectDatabases.id, id));
  if (row?.state !== 'provisioning') return;
  const plan = planOf(row);
  const password = decryptSecret(row.passwordEncrypted);
  const statements = createStatements(plan, password);

  // Count what succeeded: 1 means the role exists, 2 or more means the database does too.
  let made = 0;
  try {
    for (const sql of statements) {
      await pool.query(sql);
      made++;
    }
  } catch (e) {
    const message = (e as Error).message;
    const [dropDatabase, dropRole] = dropStatements(plan);
    if (made >= 2 && dropDatabase) await pool.query(dropDatabase).catch(() => {});
    if (made >= 1 && dropRole) await pool.query(dropRole).catch(() => {});
    await db.update(projectDatabases).set({ state: 'failed', error: message }).where(eq(projectDatabases.id, id));
    log(`database ${plan.database} failed: ${message}`);
    return;
  }

  // Apps reach Postgres by its service name on the data network.
  await setAppEnv(row.projectId, envKeyFor(row.name), connectionUrl(plan, password));
  await db.update(projectDatabases).set({ state: 'ready', error: null }).where(eq(projectDatabases.id, id));
  await audit('gust-worker', 'database.ready', `project:${await projectSlugOf(row.projectId)}`, {
    name: row.name,
    database: row.database,
    env: envKeyFor(row.name),
  });
  log(`database ${plan.database} ready; ${envKeyFor(row.name)} set on the app services (takes effect on the next deploy)`);
}

/** Removes the database, its role, and the env variable that pointed at it. */
export async function dropDatabase(id: string, log: Log) {
  const [row] = await db.select().from(projectDatabases).where(eq(projectDatabases.id, id));
  if (row?.state !== 'deleting') return;
  try {
    for (const sql of dropStatements(planOf(row))) await pool.query(sql);
    await setAppEnv(row.projectId, envKeyFor(row.name), null);
    await db.delete(projectDatabases).where(eq(projectDatabases.id, id));
    await audit('gust-worker', 'database.dropped', `project:${await projectSlugOf(row.projectId)}`, {
      name: row.name,
      database: row.database,
    });
    log(`database ${row.database} dropped`);
  } catch (e) {
    const message = (e as Error).message;
    await db.update(projectDatabases).set({ state: 'failed', error: message }).where(eq(projectDatabases.id, id));
    log(`database ${row.database} could not be dropped: ${message}`);
  }
}

/** Where dumps go: BACKUP_DIR in the container, apps/worker/backups in development. */
export const backupDir = () => process.env.BACKUP_DIR ?? resolve(process.cwd(), 'backups');

/** Host, port, user and password of the cluster admin, from DATABASE_URL. */
function clusterTarget() {
  const url = new URL(process.env.DATABASE_URL ?? 'postgres://gust:gust@127.0.0.1:5434/gust');
  return {
    host: url.hostname,
    port: url.port || '5432',
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

/** Runs a Postgres client tool with the cluster's credentials and returns its exit code and last stderr lines. */
function runTool(bin: string, args: string[], password: string): Promise<{ code: number; err: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, PGPASSWORD: password },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (c) => (err += c));
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code: code ?? 1, err: err.trim().split('\n').slice(-3).join(' ') }));
  });
}

/** A dump of one database in custom format, into BACKUP_DIR, and a record in the audit log. */
export async function backupDatabase(id: string, log: Log) {
  const [row] = await db.select().from(projectDatabases).where(eq(projectDatabases.id, id));
  if (row?.state !== 'ready') return;
  const dir = backupDir();
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `${dir}/${row.database}-${stamp}.dump`;
  const t = clusterTarget();

  const { code, err } = await runTool(
    process.env.PG_DUMP ?? 'pg_dump',
    [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--host',
      t.host,
      '--port',
      t.port,
      '--username',
      t.username,
      '--dbname',
      row.database,
      '--file',
      file,
    ],
    t.password,
  );
  if (code !== 0) {
    log(`database ${row.database} backup failed: ${err}`);
    throw new Error(`pg_dump exited with ${code}`);
  }
  await audit('gust-worker', 'database.backup', `project:${await projectSlugOf(row.projectId)}`, {
    name: row.name,
    database: row.database,
    file,
  });
  log(`database ${row.database} backed up to ${file}`);
}

/** Every ready database gets a dump, then dumps past BACKUP_KEEP_DAYS (default 14) are removed. Runs nightly. */
export async function backupAll(log: Log) {
  const ready = await db.select({ id: projectDatabases.id }).from(projectDatabases).where(eq(projectDatabases.state, 'ready'));
  for (const row of ready) {
    await backupDatabase(row.id, log).catch((e) => log(`nightly backup of ${row.id} failed: ${(e as Error).message}`));
  }
  const dir = backupDir();
  const names = await readdir(dir).catch(() => [] as string[]);
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 14);
  for (const name of expiredDumps(names, new Date(), keepDays)) {
    await unlink(`${dir}/${name}`);
    log(`removed dump ${name} (older than ${keepDays} days)`);
  }
}

/**
 * Restores a dump into a new database: creates it like provisionDatabase, then
 * pg_restore as the new role, so the objects belong to the app and not to the admin.
 * `file` must be a dump in BACKUP_DIR; the web app only passes files from the audit log.
 */
export async function restoreDatabase(id: string, file: string, log: Log) {
  const [row] = await db.select().from(projectDatabases).where(eq(projectDatabases.id, id));
  if (row?.state !== 'provisioning') return;
  if (!isInside(backupDir(), file)) {
    await db
      .update(projectDatabases)
      .set({ state: 'failed', error: 'The dump is not in the backup folder.' })
      .where(eq(projectDatabases.id, id));
    log(`restore of ${row.database} refused: ${file} is outside the backup folder`);
    return;
  }
  await provisionDatabase(id, log);
  const [made] = await db.select().from(projectDatabases).where(eq(projectDatabases.id, id));
  if (made?.state !== 'ready') return;

  const t = clusterTarget();
  const { code, err } = await runTool(
    process.env.PG_RESTORE ?? 'pg_restore',
    restoreArgs({ ...t, database: made.database, role: made.role, file }),
    t.password,
  );
  if (code !== 0) {
    // Partial data may be in the database; the user sees the error and deletes it.
    await db
      .update(projectDatabases)
      .set({ state: 'failed', error: `Restore finished with errors: ${err}` })
      .where(eq(projectDatabases.id, id));
    log(`restore of ${made.database} finished with errors: ${err}`);
    return;
  }
  await audit('gust-worker', 'database.restore', `project:${await projectSlugOf(made.projectId)}`, {
    name: made.name,
    database: made.database,
    from: file,
  });
  log(`database ${made.database} restored from ${file}`);
}

/** New password for the database's role. The app gets the new URL on its next deploy; the old password stops working at once. */
export async function rotateDatabase(id: string, log: Log) {
  const [row] = await db.select().from(projectDatabases).where(eq(projectDatabases.id, id));
  if (row?.state !== 'ready') return;
  const plan = planOf(row);
  const password = randomPassword();
  for (const sql of rotateStatements(plan, password)) await pool.query(sql);
  await db
    .update(projectDatabases)
    .set({ passwordEncrypted: encryptSecret(password) })
    .where(eq(projectDatabases.id, id));
  await setAppEnv(row.projectId, envKeyFor(row.name), connectionUrl(plan, password));
  await audit('gust-worker', 'database.rotate', `project:${await projectSlugOf(row.projectId)}`, {
    name: row.name,
    database: row.database,
  });
  log(`database ${row.database} password rotated; redeploy the app to pick up the new ${envKeyFor(row.name)}`);
}

/**
 * A restart can leave a database half made, or a delete unfinished. Half-made
 * ones are dropped (names are ours, so IF EXISTS is safe) and marked failed; the
 * user creates them again. Unfinished deletes are queued again.
 */
export async function recoverDatabases(log: Log) {
  const rows = await db
    .select()
    .from(projectDatabases)
    .where(inArray(projectDatabases.state, ['provisioning', 'deleting']));
  for (const row of rows) {
    if (row.state === 'provisioning') {
      for (const sql of dropStatements(planOf(row))) await pool.query(sql).catch(() => {});
      await db
        .update(projectDatabases)
        .set({ state: 'failed', error: 'Interrupted: the worker restarted before it finished. Delete it and create it again.' })
        .where(eq(projectDatabases.id, row.id));
      log(`database ${row.database} was interrupted; marked failed`);
    } else {
      await enqueueDatabase(row.id, 'drop');
      log(`database ${row.database} delete resumed`);
    }
  }
}
