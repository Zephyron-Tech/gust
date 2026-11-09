import 'server-only';

import { db, deployments, projects, services } from '@gust/db';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

// The numbers on the Projects page, counted from the deployments table.
// `null` means there is nothing to count yet, shown as `-`.

export type ProjectStats = {
  deploys24h: number;
  medianDeploySec: number | null;
  failed7d: number;
  lastFailed: string | null;
  liveServices: number;
  services: number;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export async function projectStats(now = new Date()): Promise<ProjectStats> {
  const since24 = new Date(now.getTime() - DAY);
  const since7 = new Date(now.getTime() - 7 * DAY);

  const [n24] = await db.select({ n: sql<number>`count(*)::int` }).from(deployments).where(gte(deployments.createdAt, since24));

  // Time from the deploy starting to traffic moving to it, for deploys that went live in the last week.
  const [med] = await db
    .select({
      s: sql<
        number | null
      >`percentile_cont(0.5) within group (order by extract(epoch from (${deployments.liveAt} - ${deployments.createdAt}))::float8)`,
    })
    .from(deployments)
    .where(and(eq(deployments.state, 'live'), gte(deployments.createdAt, since7)));

  const [failed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(deployments)
    .where(and(eq(deployments.state, 'failed'), gte(deployments.createdAt, since7)));

  const [last] = await db
    .select({ p: projects.slug, s: services.name })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(deployments.state, 'failed'), gte(deployments.createdAt, since7)))
    .orderBy(desc(deployments.createdAt))
    .limit(1);

  // Each service counts as live when its newest deploy is live.
  const latest = await db.execute<{ state: string }>(
    sql`select distinct on (service_id) state from deployments order by service_id, created_at desc`,
  );
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(services);

  const median = med?.s ?? null;
  return {
    deploys24h: n24?.n ?? 0,
    medianDeploySec: median === null || !Number.isFinite(Number(median)) ? null : Number(median),
    failed7d: failed?.n ?? 0,
    lastFailed: last ? `${last.p}/${last.s}` : null,
    liveServices: latest.rows.filter((r) => r.state === 'live').length,
    services: total?.n ?? 0,
  };
}
