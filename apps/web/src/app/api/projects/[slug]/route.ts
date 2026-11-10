import { auditEvents, db, deployments, projects, services } from '@gust/db';
import { BRANCH, validatePreviewBranches } from '@gust/db/project-rules';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { engineFetch } from '@/lib/engine-server';

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

const deleteBody = z.object({ confirm: z.string() });

// Deploys still in progress. Deleting under one would leave its container behind.
const RUNNING = ['queued', 'pulling', 'starting', 'healthy'] as const;

/**
 * Deletes a project: its services, deploys, env variables, domains and logs
 * (cascade), and its running containers on the engine. Admins only, and the
 * request must repeat the slug. Order matters:
 *  1. Reach the engine, so nothing changes if it is down.
 *  2. Turn the project's engine flag off, so the worker's reconcile loop does
 *     not start a new container for a deploy that is about to disappear.
 *  3. Remove the containers. Traefik routes only running containers, so the
 *     hosts stop answering here.
 *  4. Delete the rows and write the audit event in one transaction.
 * A failure at 3 leaves the project in place, so the same request can be sent
 * again. Stateful volumes and their backups are kept.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;
  const { slug } = await params;

  const parsed = deleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.confirm !== slug) {
    return Response.json({ error: `Type the project name (${slug}) to confirm.` }, { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });

  const busy = await db
    .select({ id: deployments.id })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .where(and(eq(services.projectId, project.id), inArray(deployments.state, [...RUNNING])))
    .limit(1);
  if (busy.length)
    return Response.json({ error: 'A deploy of this project is running. Wait for it to finish, then delete.' }, { status: 409 });

  const listed = await engineFetch('/v1/containers').catch(() => null);
  if (!listed?.ok)
    return Response.json(
      { error: 'The engine is not answering, so the containers cannot be stopped. Nothing was deleted.' },
      { status: 502 },
    );
  const containers = ((await listed.json()) as { id: string; project?: string }[]).filter((c) => c.project === slug);

  const all = await db.select({ name: services.name, type: services.type }).from(services).where(eq(services.projectId, project.id));
  const volumes = all.filter((s) => s.type === 'stateful').map((s) => `gust_${slug}_${s.name}_data`);

  if (project.engine) await db.update(projects).set({ engine: false }).where(eq(projects.id, project.id));

  for (const c of containers) {
    const res = await engineFetch(`/v1/containers/${c.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      // Back on the engine, so the project keeps working (and being restored) until the delete is tried again.
      if (project.engine) await db.update(projects).set({ engine: true }).where(eq(projects.id, project.id));
      return Response.json(
        { error: 'Could not remove a container. The project is kept, so the same request can run again.' },
        { status: 502 },
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(projects).where(eq(projects.id, project.id));
    await tx.insert(auditEvents).values({
      actor: u.email,
      action: 'project.delete',
      target: slug,
      detail: { services: all.map((s) => s.name), containers: containers.length, volumesKept: volumes },
    });
  });
  return Response.json({ ok: true, containers: containers.length, volumesKept: volumes });
}
