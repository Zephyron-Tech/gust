import { requireUser } from '@/lib/auth';
import { GithubError, repoDetail } from '@/lib/github-repos';

export const dynamic = 'force-dynamic';

// One repository for the import: branches, Dockerfile hints, an existing Gust workflow. Admins only.
export async function GET(req: Request, { params }: { params: Promise<{ owner: string; name: string }> }) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { owner, name } = await params;
  try {
    return Response.json(await repoDetail(`${owner}/${name}`, new URL(req.url).searchParams.has('fresh')));
  } catch (e) {
    if (e instanceof GithubError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
