import 'server-only';

import { type Deployment, previewHost } from '@gust/contracts';
import { db, deploymentLogs, deployments, projects, services } from '@gust/db';
import { and, asc, desc, eq } from 'drizzle-orm';

export type ApiDeployment = Deployment & { containerId?: string; engine: true };

type Row = { d: typeof deployments.$inferSelect; p: string; s: string; pb: string };

function toApi({ d, p, s, pb }: Row, logs: { ts: Date; phase: string; line: string }[] = []): ApiDeployment {
  const end = d.finishedAt ?? null;
  const domain = process.env.GUST_DOMAIN;
  // A preview is served on its own host; production has no preview URL.
  const previewUrl = d.branch && domain ? `https://${previewHost(d.branch, p, domain)}` : undefined;
  return {
    id: d.id,
    project: p,
    service: s,
    sha: d.commitSha ? d.commitSha.slice(0, 7) : d.tag,
    message: d.message,
    author: d.author,
    branch: d.branch ?? pb,
    previewUrl,
    trigger: d.trigger,
    state: d.state,
    createdAt: d.createdAt.toISOString(),
    duration: end ? `${Math.max(1, Math.round((end.getTime() - d.createdAt.getTime()) / 1000))} s` : undefined,
    error: d.error ?? undefined,
    containerId: d.containerId ?? undefined,
    logs: logs.map((l) => ({ ts: l.ts.toLocaleTimeString('en-GB', { hour12: false }), phase: l.phase, line: l.line })),
    engine: true,
  };
}

const base = () =>
  db
    .select({ d: deployments, p: projects.slug, s: services.name, pb: projects.productionBranch })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id));

export async function listDeployments(project?: string, service?: string) {
  const where = and(project ? eq(projects.slug, project) : undefined, service ? eq(services.name, service) : undefined);
  const rows = await base().where(where).orderBy(desc(deployments.createdAt)).limit(100);
  return rows.map((r) => toApi(r));
}

export async function getDeployment(id: string) {
  const [row] = await base().where(eq(deployments.id, id));
  if (!row) return null;
  const logs = await db
    .select({ ts: deploymentLogs.ts, phase: deploymentLogs.phase, line: deploymentLogs.line })
    .from(deploymentLogs)
    .where(eq(deploymentLogs.deploymentId, id))
    .orderBy(asc(deploymentLogs.id));
  return toApi(row, logs);
}
