import { auditEvents, db, projects } from '@gust/db';
import { BRANCH, validatePreviewBranches } from '@gust/db/project-rules';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

const body = z.object({
  productionBranch: z.string().regex(BRANCH, 'Branch name is not valid').optional(),
  previewBranches: z.array(z.string().max(100)).max(10).optional(),
});

// Which branches deploy to production and which to previews. Admins only, like the other project changes.
export async function PATCH(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug } = await params;

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  if (parsed.data.productionBranch === undefined && parsed.data.previewBranches === undefined) {
    return Response.json({ error: 'Nothing to change' }, { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });

  // Checked together, so a new production branch cannot also be a preview branch.
  const production = parsed.data.productionBranch ?? project.productionBranch;
  const previews = validatePreviewBranches(parsed.data.previewBranches ?? project.previewBranches, production);
  if (!previews.ok) return Response.json({ error: previews.error }, { status: 400 });

  const change: { productionBranch?: string; previewBranches?: string[] } = {};
  if (parsed.data.productionBranch !== undefined) change.productionBranch = production;
  if (parsed.data.previewBranches !== undefined) change.previewBranches = previews.value;

  await db.update(projects).set(change).where(eq(projects.id, project.id));
  await db.insert(auditEvents).values({ actor: u.email, action: 'project.update', target: slug, detail: change });
  return Response.json({ productionBranch: production, previewBranches: previews.value });
}
