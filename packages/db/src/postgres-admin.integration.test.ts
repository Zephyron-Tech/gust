// Runs the statements against a real Postgres as the cluster admin. Skipped when
// no server answers at GUST_TEST_DATABASE_URL (default: the dev stack on 5434).
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { connectionUrl, createStatements, dropStatements, literal, planFor, randomPassword } from './postgres-admin';

const admin = process.env.GUST_TEST_DATABASE_URL ?? 'postgres://gust:gust@127.0.0.1:5434/gust';

const reachable = await (async () => {
  const c = new pg.Client({ connectionString: admin, connectionTimeoutMillis: 1500 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
})();

const suffix = Math.random().toString(36).slice(2, 8);
const plan = planFor(`gusttest${suffix}`, 'main');
const otherRole = `${plan.role}_other`;
const password = randomPassword();
const cleanup: string[] = [];

async function as(url: string) {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  await c.connect();
  return c;
}

describe.skipIf(!reachable)('per-project databases on a real Postgres', () => {
  afterAll(async () => {
    const c = await as(admin);
    for (const sql of cleanup) await c.query(sql).catch(() => {});
    await c.query(`DROP ROLE IF EXISTS ${otherRole}`).catch(() => {});
    await c.end();
  });

  it('creates the database and role, and only the owner can connect', async () => {
    const c = await as(admin);
    for (const sql of createStatements(plan, password)) await c.query(sql);
    cleanup.push(...dropStatements(plan));
    await c.query(`CREATE ROLE ${otherRole} LOGIN PASSWORD ${literal(randomPassword())}`);
    await c.end();

    const owner = await as(connectionUrl(plan, password, '127.0.0.1', 5434));
    await owner.query('CREATE TABLE t (id int)');
    await owner.query('INSERT INTO t VALUES (1)');
    expect((await owner.query('SELECT count(*)::int AS n FROM t')).rows[0].n).toBe(1);
    await owner.end();

    const url = new URL(admin);
    url.username = otherRole;
    url.password = 'wrong';
    const foreign = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 3000 });
    // The other role cannot even reach the database: PUBLIC's CONNECT was revoked.
    await expect(foreign.connect()).rejects.toThrow();
  });

  it('drops the database and role, ending a connection that is still open', async () => {
    const holder = await as(connectionUrl(plan, password, '127.0.0.1', 5434));
    // FORCE closes this connection on the server side; that is the point of the test.
    holder.on('error', () => {});
    const c = await as(admin);
    for (const sql of dropStatements(plan)) await c.query(sql);
    expect((await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [plan.database])).rowCount).toBe(0);
    expect((await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [plan.role])).rowCount).toBe(0);
    await c.end();
  });
});
