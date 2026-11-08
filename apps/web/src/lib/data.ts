import 'server-only';

// Projects and services as the UI shows them, read from the database.
import type { Health, Project } from '@gust/contracts';
import { db, deployments, projects, services } from '@gust/db';
import { asc, desc, eq, inArray } from 'drizzle-orm';

export type UiProject = Project & { id: string };

function health(states: string[]): Health {
  if (states.includes('live')) return 'live';
  if (states.includes('failed')) return 'failed';
  return 'stopped';
}

/** All projects with their services; health and last deploy from real deploys where they exist. */
export async function getProjects(): Promise<UiProject[]> {
  const ps = await db.select().from(projects).orderBy(desc(projects.engine), asc(projects.createdAt));
  const ss = await db.select().from(services).orderBy(asc(services.createdAt));
  const ds = ss.length
    ? await db
        .select({ serviceId: deployments.serviceId, state: deployments.state, createdAt: deployments.createdAt })
        .from(deployments)
        .where(
          inArray(
            deployments.serviceId,
            ss.map((s) => s.id),
          ),
        )
        .orderBy(desc(deployments.createdAt))
    : [];
  return ps.map((p) => {
    const mine = ss.filter((s) => s.projectId === p.id);
    const deps = ds.filter((d) => mine.some((s) => s.id === d.serviceId));
    return {
      id: p.id,
      slug: p.slug,
      repo: p.repo,
      domain: p.domain,
      engine: p.engine,
      // Sample projects have no real deploys yet; they read as live.
      health: p.engine
        ? health(deps.slice(0, 3).map((d) => d.state))
        : p.slug === 'moodtracker'
          ? 'failed'
          : p.slug === 'clearway'
            ? 'stopped'
            : 'live',
      lastDeploy: (deps[0]?.createdAt ?? p.createdAt).toISOString(),
      services: mine.map((s) => ({
        name: s.name,
        type: s.type,
        image: s.image,
        port: s.port ?? undefined,
        healthPath: s.healthPath ?? undefined,
        domains: s.domains,
        cpu: s.cpu,
        memoryMb: s.memoryMb,
        health: 'live' as const,
      })),
    };
  });
}

export async function getProject(slug: string) {
  return (await getProjects()).find((p) => p.slug === slug) ?? null;
}

export async function getServiceRow(project: string, service: string) {
  const [row] = await db
    .select({ s: services, p: projects })
    .from(services)
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(eq(services.id, `svc_${project}_${service}`));
  return row ?? null;
}
