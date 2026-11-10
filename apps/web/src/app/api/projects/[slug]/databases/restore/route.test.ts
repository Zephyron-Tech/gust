import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
let role: 'admin' | 'member' = 'admin';
vi.mock('@/lib/auth', () => ({
  requireUser: async (_req: Request, need?: 'admin') => {
    if (need === 'admin' && role !== 'admin') return Response.json({ error: 'Only admins can do this' }, { status: 403 });
    return { email: 'test@gust.invalid', role };
  },
}));

const { auditEvents, db, projectDatabases } = await import('@gust/db');
const { and, eq, sql } = await import('drizzle-orm');
const { POST } = await import('./route');

const slug = 'demo';
const FILE = 'demo_restore_probe-2026-11-10T03-00-00-000Z.dump';
const RECORDED = `/srv/backups/${FILE}`;

const call = (body: unknown) =>
  POST(
    new Request(`http://gust.test/api/projects/${slug}/databases/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug }) },
  );

describe('POST /api/projects/[slug]/databases/restore', () => {
  beforeAll(async () => {
    await db.insert(auditEvents).values({
      actor: 'gust-worker',
      action: 'database.backup',
      target: `project:${slug}`,
      detail: { name: 'probe', database: 'demo_restore_probe', file: RECORDED },
    });
  });

  afterAll(async () => {
    // Only the probe row: the project's real backups stay.
    await db.delete(auditEvents).where(and(eq(auditEvents.action, 'database.backup'), sql`${auditEvents.detail}->>'file' = ${RECORDED}`));
  });

  it('refuses a file that is not a recorded backup of this project', async () => {
    expect((await call({ file: '../../etc/passwd', name: 'restore_probe_check' })).status).toBe(404);
  });

  it('refuses a name with no letters before touching anything', async () => {
    expect((await call({ file: FILE, name: '---' })).status).toBe(400);
  });

  it('is admin only', async () => {
    role = 'member';
    expect((await call({ file: FILE, name: 'restore_probe_check' })).status).toBe(403);
    role = 'admin';
    const rows = await db.select().from(projectDatabases).where(eq(projectDatabases.id, 'pdb_demo_restore_probe_check'));
    expect(rows).toHaveLength(0);
  });
});
