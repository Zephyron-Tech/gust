import { auditEvents, db, projects, services } from '@gust/db';
import { validateNewProject } from '@gust/db/project-rules';
import { eq } from 'drizzle-orm';

import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Creates a project with its first service, as `gust project add` does. Admins only.
export async function POST(req: Request) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return Response.json({ error: 'Send the form as JSON' }, { status: 400 });
  const checked = validateNewProject(body as Record<string, unknown>);
  if (!checked.ok) return Response.json({ error: 'Check the highlighted fields', errors: checked.errors }, { status: 400 });
  const v = checked.value;

  const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, v.slug));
  if (existing) {
    return Response.json({ error: `Project ${v.slug} already exists`, errors: { slug: 'Already taken' } }, { status: 409 });
  }

  try {
    // One transaction: a project never exists without its service.
    await db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id: `prj_${v.slug}`,
        slug: v.slug,
        repo: v.repo,
        domain: v.domain,
        engine: true,
        githubRepo: v.repo,
        productionBranch: v.branch,
      });
      await tx.insert(services).values({
        id: `svc_${v.slug}_${v.service}`,
        projectId: `prj_${v.slug}`,
        name: v.service,
        type: 'app',
        image: `${v.slug}/${v.service}`,
        port: v.port,
        healthPath: v.healthPath,
        domains: [v.domain],
        memoryMb: v.memoryMb,
        cpu: v.cpu,
      });
      await tx.insert(auditEvents).values([
        {
          actor: u.email,
          action: 'project.create',
          target: v.slug,
          detail: { repo: v.repo, branch: v.branch },
        },
        {
          actor: u.email,
          action: 'service.create',
          target: `${v.slug}/${v.service}`,
          detail: { port: v.port, domains: [v.domain], image: `${v.slug}/${v.service}` },
        },
      ]);
    });
  } catch (e) {
    // Two requests with the same slug at once: the second hits the unique key.
    if ((e as { code?: string }).code === '23505') {
      return Response.json({ error: `Project ${v.slug} already exists`, errors: { slug: 'Already taken' } }, { status: 409 });
    }
    throw e;
  }

  return Response.json({ slug: v.slug, service: v.service }, { status: 201 });
}
