// Redis databases on the shared Redis: one ACL user per (project, name), limited to
// the keys under `<database>:`. Pure: it builds argument lists and runs none. The
// worker sends them as the Redis admin, one command at a time.

/** The ACL user and key prefix of one Redis database. Same naming as Postgres: `<slug>_<name>`. */
export type RedisPlan = { database: string; role: string };

/** Key pattern a Redis database may touch: its own keys only. */
export const keyPattern = (plan: { database: string }) => `${plan.database}:*`;

/**
 * ACL SETUSER arguments that create or reset the user. `resetpass` first clears old
 * passwords, so rotation leaves exactly one. Commands: everything except dangerous
 * ones (FLUSHALL, CONFIG, ACL, DEBUG and friends).
 */
export function aclSetUserArgs(plan: RedisPlan, password: string): string[] {
  return [
    'ACL',
    'SETUSER',
    plan.role,
    'on',
    'resetpass',
    `>${password}`,
    'resetkeys',
    `~${keyPattern(plan)}`,
    'resetchannels',
    'nocommands',
    '+@all',
    '-@dangerous',
  ];
}

/** Removes the user. Its keys are deleted by the worker, not by this command. */
export const aclDelUserArgs = (plan: RedisPlan): string[] => ['ACL', 'DELUSER', plan.role];

/** The URL a project's app receives. Host is the Redis service name on the data network. */
export function redisConnectionUrl(plan: RedisPlan, password: string, host = 'redis', port = 6379): string {
  return `redis://${encodeURIComponent(plan.role)}:${encodeURIComponent(password)}@${host}:${port}`;
}

/** Suffix of a Redis backup file. Postgres dumps end in `.dump`; the restore route picks the kind from this. */
export const redisDumpSuffix = '.redis.ndjson';

/**
 * Key of a backed-up key in a new database: the source prefix is swapped for the new one.
 * Throws when the key is not under the source prefix, so a damaged file is not restored into the wrong place.
 */
export function redisKeyInto(from: string, to: string, key: string): string {
  if (!key.startsWith(`${from}:`)) throw new Error(`key ${key} is not under ${from}:`);
  return `${to}${key.slice(from.length)}`;
}
