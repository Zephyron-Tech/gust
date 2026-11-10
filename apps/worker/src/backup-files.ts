// Pure helpers for the database dumps: where they go, what pg_restore is told,
// and which old dumps retention removes. No I/O here, so the rules are unit tested.
import { isAbsolute, relative, resolve } from 'node:path';

import { redisDumpSuffix } from '@gust/db/redis-admin';

/** Name of a dump Gust wrote: `<database>-<ISO stamp with - for : and .>.dump` (Postgres) or `.redis.ndjson` (Redis). */
export const DUMP_NAME = /^[a-z][a-z0-9_]*-\d{4}-\d{2}-\d{2}T[\d-]+Z(\.dump|\.redis\.ndjson)$/;

/** The backup file name for a database at `stamp` (ISO string with - for : and .). */
export function dumpName(database: string, stamp: string, kind: 'postgres' | 'redis'): string {
  return `${database}-${stamp}${kind === 'redis' ? redisDumpSuffix : '.dump'}`;
}

/** True when `file` resolves to a path inside `dir`. Stops a crafted name from reaching another folder. */
export function isInside(dir: string, file: string): boolean {
  const rel = relative(resolve(dir), resolve(file));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** Arguments for pg_restore into `database`. `--role` makes the restored objects owned by the new app role. */
export function restoreArgs(opts: {
  host: string;
  port: string;
  username: string;
  database: string;
  role: string;
  file: string;
}): string[] {
  return [
    '--no-owner',
    '--no-acl',
    '--role',
    opts.role,
    '--host',
    opts.host,
    '--port',
    opts.port,
    '--username',
    opts.username,
    '--dbname',
    opts.database,
    opts.file,
  ];
}

/** The moment a dump was taken, from its name; null when the name has no stamp. */
export function dumpTime(name: string): number | null {
  const m = name.match(/-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:\.dump|\.redis\.ndjson)$/);
  if (!m) return null;
  const [, date, h, min, s, ms] = m;
  const at = Date.parse(`${date}T${h}:${min}:${s}.${ms}Z`);
  return Number.isFinite(at) ? at : null;
}

/** Dumps in `names` taken before `now` minus `keepDays`. Files that are not dumps are never listed. */
export function expiredDumps(names: string[], now: Date, keepDays: number): string[] {
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  return names.filter((name) => {
    if (!DUMP_NAME.test(name)) return false;
    const at = dumpTime(name);
    return at !== null && at < cutoff;
  });
}
