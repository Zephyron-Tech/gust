// The databases endpoints against the real dev database and the running worker.
// Only the sign-in is replaced: requireUser is a stub that answers as the role the test asks for.
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const startedAt = new Date();
let role: 'admin' | 'member' = 'admin';
// Tests that wait for the worker to provision, back up or drop a database need it
// running and its PG_DUMP wrappers set. CI has no worker: set GUST_WORKER_TESTS=1 to run them.
const worker = process.env.GUST_WORKER_TESTS === '1';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({
  requireUser: async (_req: Request, need?: 'admin') => {
    if (need === 'admin' && role !== 'admin') return Response.json({ error: 'Only admins can do this' }, { status: 403 });
    return { email: 'test@gust.invalid', role };
  },
}));

const { db, pool, projectDatabases, auditEvents, envVars, services, projects } = await import('@gust/db');
const { dropStatements, planFor } = await import('@gust/db/postgres-admin');
const { and, eq, gte, inArray, like } = await import('drizzle-orm');
const { POST, GET } = await import('./route');
const { DELETE } = await import('./[id]/route');
const { POST: BACKUP } = await import('./[id]/backup/route');

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const ctxId = (slug: string, id: string) => ({ params: Promise.resolve({ slug, id }) });
const post = (slug: string, name: unknown) =>
  POST(new Request('http://gust.test/api/projects/x/databases', { method: 'POST', body: JSON.stringify({ name }) }), ctx(slug));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(read: () => Promise<T | undefined>, what: string): Promise<T> {
  for (let i = 0; i < 80; i++) {
    const v = await read();
    if (v !== undefined) return v;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const rowOf = async (id: string) => (await db.select().from(projectDatabases).where(eq(projectDatabases.id, id)))[0];
const appEnvKeys = async () =>
  db
    .select({ key: envVars.key })
    .from(envVars)
    .innerJoin(services, eq(services.id, envVars.serviceId))
    .innerJoin(projects, eq(projects.id, services.projectId))
    .where(and(eq(projects.slug, 'demo'), eq(services.type, 'app'), like(envVars.key, 'DATABASE_URL%')));

const plan = planFor('demo', 'api');
const id = `pdb_${plan.database}`;

beforeAll(() => {
  expect(process.env.GUST_MASTER_KEY, 'load apps/web/.env.local first').toBeTruthy();
});

afterAll(async () => {
  for (const q of dropStatements(plan)) await pool.query(q);
  await db.delete(envVars).where(and(inArray(envVars.key, ['DATABASE_URL_API']), gte(envVars.createdAt, startedAt)));
  await db.delete(projectDatabases).where(eq(projectDatabases.id, id));
  await db.delete(auditEvents).where(and(eq(auditEvents.target, 'project:demo'), gte(auditEvents.at, startedAt)));
  await pool.end();
});

describe('database endpoints', () => {
  it('needs an admin', async () => {
    role = 'member';
    expect((await post('demo', 'main')).status).toBe(403);
    expect((await DELETE(new Request('http://gust.test', { method: 'DELETE' }), ctxId('demo', id))).status).toBe(403);
    role = 'admin';
  });

  it('404s for an unknown project', async () => {
    expect((await post('no-such-project', 'main')).status).toBe(404);
  });

  it('rejects an empty or unusable name, and creates nothing for it', async () => {
    expect((await post('demo', '')).status).toBe(400);
    expect((await post('demo', '---')).status).toBe(400);
    expect(
      await db
        .select()
        .from(projectDatabases)
        .where(and(eq(projectDatabases.projectId, 'prj_demo'), gte(projectDatabases.createdAt, startedAt)))
        .then((r) => r.length),
    ).toBe(0);
  });

  it.skipIf(!worker)('creates the row, and the worker makes the database and the app env variable', { timeout: 60_000 }, async () => {
    const res = await post('demo', 'api');
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; state: string };
    expect(body.state).toBe('provisioning');
    expect(JSON.stringify(body)).not.toMatch(/password/i);

    const done = await until(async () => {
      const r = await rowOf(id);
      return r && r.state !== 'provisioning' ? r : undefined;
    }, 'provisioning');
    expect(done.state).toBe('ready');
    expect(done.error).toBeNull();
    expect((await appEnvKeys()).map((k) => k.key)).toContain('DATABASE_URL_API');
  });

  it('refuses a second database with the same name', async () => {
    // The first call makes the row when the worker test above did not run.
    await post('demo', 'api');
    expect((await post('demo', 'api')).status).toBe(409);
  });

  it('lists the databases and the backups, without passwords', async () => {
    const res = await GET(new Request('http://gust.test/api/projects/demo/databases'), ctx('demo'));
    const body = (await res.json()) as { databases: Record<string, unknown>[]; backups: unknown[] };
    expect(body.databases.some((r) => r.name === 'api')).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/password/i);
  });

  it.skipIf(!worker)('backs up a ready database into a file and records it', { timeout: 60_000 }, async () => {
    const res = await BACKUP(new Request('http://gust.test', { method: 'POST' }), ctxId('demo', id));
    expect(res.status).toBe(202);
    const audit = await until(async () => {
      const [a] = await db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.target, 'project:demo'), eq(auditEvents.action, 'database.backup'), gte(auditEvents.at, startedAt)));
      return a;
    }, 'backup record');
    const file = (audit.detail as { file: string }).file;
    expect(existsSync(file)).toBe(true);
  });

  it.skipIf(!worker)('deletes: the worker drops the database and removes its env variable', { timeout: 60_000 }, async () => {
    const res = await DELETE(new Request('http://gust.test', { method: 'DELETE' }), ctxId('demo', id));
    expect(res.status).toBe(202);
    await until(async () => ((await rowOf(id)) === undefined ? true : undefined), 'row removed');
    const dbs = await pool.query('select 1 from pg_database where datname = $1', [plan.database]);
    expect(dbs.rowCount).toBe(0);
    expect((await appEnvKeys()).map((k) => k.key)).not.toContain('DATABASE_URL_API');
  });
});
