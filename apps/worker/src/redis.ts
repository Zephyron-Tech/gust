// Redis databases on the shared Redis: one ACL user per database, limited to its own
// key prefix, plus a dump of the prefix's keys and its restore into a new database.
// The commands come from @gust/db/redis-admin; this file only sends them over one
// admin connection. Orchestration (state, env, audit) lives in databases.ts.

import { createReadStream } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

import { aclDelUserArgs, aclSetUserArgs, keyPattern, type RedisPlan, redisKeyInto } from '@gust/db/redis-admin';
import { createClient, RESP_TYPES } from 'redis';

/** One place builds the client, so its type is the one the cache holds. */
function makeClient() {
  const c = createClient({ url: process.env.REDIS_ADMIN_URL ?? 'redis://:gust-dev-redis@127.0.0.1:6380' });
  c.on('error', () => {
    // Commands report the failure to their caller; node-redis reconnects on its own.
  });
  return c;
}

// The connect promise is cached, so concurrent callers share one client while Redis is down.
let connecting: Promise<ReturnType<typeof makeClient>> | null = null;

/** The admin connection, opened on first use. Failed connects are retried by the next caller. */
function admin() {
  if (!connecting) {
    const c = makeClient();
    connecting = c
      .connect()
      .then(() => c)
      .catch((e) => {
        connecting = null;
        throw e;
      });
  }
  return connecting;
}

/** Creates the user, or resets its password and key limits. Re-running it is safe, so rotation and recovery use it too. */
export async function setRedisUser(plan: RedisPlan, password: string) {
  const c = await admin();
  await c.sendCommand(aclSetUserArgs(plan, password));
}

/** Removes the user. An unknown user is not an error for ACL DELUSER. */
export async function deleteRedisUser(plan: RedisPlan) {
  const c = await admin();
  await c.sendCommand(aclDelUserArgs(plan));
}

/** Calls `fn` for every key under the database's prefix, found with SCAN in batches. */
async function eachKey(plan: RedisPlan, fn: (keys: string[]) => Promise<void>) {
  const c = await admin();
  let cursor = '0';
  do {
    const [next, keys] = (await c.sendCommand(['SCAN', cursor, 'MATCH', keyPattern(plan), 'COUNT', '500'])) as [string, string[]];
    if (keys.length > 0) await fn(keys);
    cursor = next;
  } while (cursor !== '0');
}

/** Deletes every key under the database's prefix, in batches, without blocking Redis (UNLINK). */
export async function deleteRedisKeys(plan: RedisPlan) {
  const c = await admin();
  await eachKey(plan, async (keys) => {
    await c.sendCommand(['UNLINK', ...keys]);
  });
}

/**
 * Writes every key under the prefix to `file`, one JSON line per key: its name, its
 * remaining time to live in ms (0 for none) and its DUMP payload in base64. The first
 * line is a header with the source database, so a restore knows which prefix to swap.
 */
export async function dumpRedisKeys(plan: RedisPlan, file: string): Promise<number> {
  const c = await admin();
  const bytes = c.withTypeMapping({ [RESP_TYPES.BLOB_STRING]: Buffer });
  await writeFile(file, `${JSON.stringify({ format: 1, database: plan.database })}\n`);
  let count = 0;
  await eachKey(plan, async (keys) => {
    const lines: string[] = [];
    for (const key of keys) {
      const ttl = (await c.sendCommand(['PTTL', key])) as number;
      const payload = (await bytes.dump(key)) as Buffer | null;
      // A key that expired between SCAN and DUMP has no payload any more.
      if (payload === null) continue;
      lines.push(JSON.stringify({ k: key, ttl: Math.max(ttl, 0), d: payload.toString('base64') }));
      count++;
    }
    if (lines.length > 0) await appendFile(file, `${lines.join('\n')}\n`);
  });
  return count;
}

/**
 * Restores a dump written by dumpRedisKeys into `to`: every key gets the new prefix
 * and its payload is RESTOREd with REPLACE. Returns how many keys were written.
 */
export async function restoreRedisKeys(file: string, to: RedisPlan): Promise<number> {
  const c = await admin();
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let from: string | null = null;
  let count = 0;
  for await (const line of rl) {
    if (line.trim() === '') continue;
    const entry = JSON.parse(line) as { format?: number; database?: string; k?: string; ttl?: number; d?: string };
    if (from === null) {
      if (entry.format !== 1 || typeof entry.database !== 'string') throw new Error('not a Gust Redis dump');
      from = entry.database;
      continue;
    }
    if (typeof entry.k !== 'string' || typeof entry.d !== 'string') throw new Error('damaged Redis dump line');
    const key = redisKeyInto(from, to.database, entry.k);
    await c.sendCommand(['RESTORE', key, String(entry.ttl ?? 0), Buffer.from(entry.d, 'base64'), 'REPLACE']);
    count++;
  }
  if (from === null) throw new Error('empty Redis dump');
  return count;
}
