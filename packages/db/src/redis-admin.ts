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
