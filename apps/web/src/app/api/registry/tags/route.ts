import { requireUser } from '@/lib/auth';
import { registryTags } from '@/lib/engine-server';

export async function GET(req: Request) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const repo = new URL(req.url).searchParams.get('repo') ?? '';
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(repo)) return Response.json({ error: 'Invalid repository' }, { status: 400 });
  return Response.json({ tags: await registryTags(repo) });
}
