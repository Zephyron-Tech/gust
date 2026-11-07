import { registryTags } from '@/lib/engine-server';

export async function GET(req: Request) {
  const repo = new URL(req.url).searchParams.get('repo') ?? '';
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(repo)) return Response.json({ error: 'Invalid repository' }, { status: 400 });
  return Response.json({ tags: await registryTags(repo) });
}
