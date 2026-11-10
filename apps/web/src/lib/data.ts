import 'server-only';

// Projects and services as the UI shows them, read from the database.
import type { Health, Project } from '@gust/contracts';
import { db, deployments, projects, services } from '@gust/db';
import { asc, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';

import { iconCheckDue } from './project-icon';
import { refreshIconFromSite } from './project-icon-fetch';

/** `icon` is the URL of the project's icon, or null for the letter tile. */
export type UiProject = Project & { id: string; icon: string | null };

function health(states: string[]): Health {
  if (states.includes('live')) return 'live';
  if (states.includes('failed')) return 'failed';
  return 'stopped';
}

/** All projects with their services; health and last deploy from real deploys where they exist. */
export async function getProjects(): Promise<UiProject[]> {
  // The icon's bytes stay in the database until the icon is asked for; the list only needs to know there is one.
  const { iconData: _bytes, ...columns } = getTableColumns(projects);
  const ps = await db
    .select({ ...columns, hasIcon: sql<boolean>`${projects.iconData} is not null` })
    .from(projects)
    .orderBy(desc(projects.engine), asc(projects.createdAt));
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
    // A site without an icon is asked for one in the background, at most once a day; the next view shows it.
    const wanted = !p.hasIcon && p.iconSource !== 'manual' && p.iconSource !== 'removed';
    if (wanted && iconCheckDue(p.iconCheckedAt)) void refreshIconFromSite(p.slug).catch(() => false);
    const mine = ss.filter((s) => s.projectId === p.id);
    const deps = ds.filter((d) => mine.some((s) => s.id === d.serviceId));
    return {
      id: p.id,
      slug: p.slug,
      repo: p.repo,
      domain: p.domain,
      icon: p.hasIcon ? `/api/projects/${p.slug}/icon?v=${p.iconUpdatedAt?.getTime() ?? 0}` : null,
      engine: p.engine,
      productionBranch: p.productionBranch,
      previewBranches: p.previewBranches,
      // Sample projects have no real deploys yet; they read as live.
      health: p.engine
        ? // Every app stopped by hand reads as a stopped project; otherwise the newest deploys decide.
          mine.length > 0 && mine.every((s) => s.stopped)
          ? 'stopped'
          : health(deps.slice(0, 3).map((d) => d.state))
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
        health: (s.stopped ? 'stopped' : 'live') as 'live' | 'stopped',
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
