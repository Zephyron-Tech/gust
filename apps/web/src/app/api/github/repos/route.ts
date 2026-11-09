import { db, projects, services } from '@gust/db';
import { eq } from 'drizzle-orm';

import { requireUser } from '@/lib/auth';
import { GithubError, listRepos } from '@/lib/github-repos';

export const dynamic = 'force-dynamic';

// Repositories that can be imported, each with the project it already belongs to. Admins only.
export async function GET(req: Request) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  try {
    const fresh = new URL(req.url).searchParams.has('fresh');
    const [repos, rows] = await Promise.all([
      listRepos(fresh),
      db
        .select({ repo: projects.githubRepo, slug: projects.slug, service: services.name })
        .from(projects)
        .leftJoin(services, eq(services.projectId, projects.id)),
    ]);
    const imported = new Map<string, { slug: string; service: string | null }>();
    for (const r of rows)
      if (r.repo && !imported.has(r.repo.toLowerCase())) imported.set(r.repo.toLowerCase(), { slug: r.slug, service: r.service });
    return Response.json(repos.map((r) => ({ ...r, imported: imported.get(r.fullName.toLowerCase()) ?? null })));
  } catch (e) {
    if (e instanceof GithubError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
