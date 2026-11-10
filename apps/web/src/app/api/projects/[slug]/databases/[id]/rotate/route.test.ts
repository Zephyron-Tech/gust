import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
let role: 'admin' | 'member' = 'admin';
vi.mock('@/lib/auth', () => ({
  requireUser: async (_req: Request, need?: 'admin') => {
    if (need === 'admin' && role !== 'admin') return Response.json({ error: 'Only admins can do this' }, { status: 403 });
    return { email: 'test@gust.invalid', role };
  },
}));

const { POST } = await import('./route');

const call = (slug: string, id: string) =>
  POST(new Request(`http://gust.test/api/projects/${slug}/databases/${id}/rotate`, { method: 'POST' }), {
    params: Promise.resolve({ slug, id }),
  });

describe('POST /api/projects/[slug]/databases/[id]/rotate', () => {
  it('is admin only', async () => {
    role = 'member';
    expect((await call('demo', 'pdb_demo_ops')).status).toBe(403);
    role = 'admin';
  });

  it('returns 404 for a database the project does not own', async () => {
    expect((await call('demo', 'pdb_no_such_database')).status).toBe(404);
  });
});
