// Redis databases on the shared Redis: one ACL user per database, limited to its own
// key prefix. The commands come from @gust/db/redis-admin; this file only sends them
// over one admin connection. Orchestration (state, env, audit) lives in databases.ts.
import { aclDelUserArgs, aclSetUserArgs, keyPattern, type RedisPlan } from '@gust/db/redis-admin';
import { createClient } from 'redis';

/** One place builds the client, so its type is the one the cache holds. */
function makeClient() {
  const c = createClient({ url: process.env.REDIS_ADMIN_URL ?? 'redis://:gust-dev-redis@127.0.0.1:6380' });
  c.on('error', () => {
    // Commands report the failure to their caller; node-redis reconnects on its own.
  });
  return c;
}

let client: ReturnType<typeof makeClient> | null = null;

/** The admin connection, opened on first use. REDIS_ADMIN_URL carries the admin password. */
async function admin() {
  if (!client) {
    const c = makeClient();
    await c.connect();
    client = c;
  }
  return client;
}

/** Creates the user, or resets its password and key limits. Re-running it is safe, so rotation uses it too. */
export async function setRedisUser(plan: RedisPlan, password: string) {
  const c = await admin();
  await c.sendCommand(aclSetUserArgs(plan, password));
}

/** Removes the user. An unknown user is not an error for ACL DELUSER. */
export async function deleteRedisUser(plan: RedisPlan) {
  const c = await admin();
  await c.sendCommand(aclDelUserArgs(plan));
}

/** Deletes every key under the database's prefix, in batches, without blocking Redis (UNLINK). */
export async function deleteRedisKeys(plan: RedisPlan) {
  const c = await admin();
  let cursor = '0';
  do {
    const [next, keys] = (await c.sendCommand(['SCAN', cursor, 'MATCH', keyPattern(plan), 'COUNT', '500'])) as [string, string[]];
    if (keys.length > 0) await c.sendCommand(['UNLINK', ...keys]);
    cursor = next;
  } while (cursor !== '0');
}
