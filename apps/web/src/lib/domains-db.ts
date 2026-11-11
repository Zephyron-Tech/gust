import 'server-only';

import { HOSTNAME, previewHost } from '@gust/contracts';
import { auditEvents, db, deployments, type projects, pullRequests, serviceDomains, services } from '@gust/db';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { serverIp } from './public-url';

export type DomainState = 'pending_dns' | 'applying' | 'live' | 'error';

export type ProductionDomain = { host: string; state: DomainState; error: string | null; checkedAt: string | null };
/** `host` is null while GUST_DOMAIN is not set. */
export type PreviewDomain = {
  branch: string;
  host: string | null;
  live: boolean;
  /** Set for a pull request preview (branch pr-<n>): its number, title and author. */
  pr?: { number: number; title: string; author: string };
  /** Set for a branch preview: the commit its live deploy was built from. */
  commit?: { sha: string | null; message: string | null; author: string } | null;
};

export type DomainsView = {
  /** The A record target; null until GUST_SERVER_IP is set. */
  serverIp: string | null;
  /** Gust's own host, a CNAME target that resolves to the server. */
  cnameTarget: string | null;
  production: ProductionDomain[];
  previews: PreviewDomain[];
};

type ServiceRow = { s: typeof services.$inferSelect; p: typeof projects.$inferSelect };

/**
 * The service's domains: custom production domains with how far each is,
 * and the automatic preview hosts. Domains routed before the domains table
 * existed (CLI, seed) count as live.
 */
export async function listDomains({ s, p }: ServiceRow): Promise<DomainsView> {
  const rows = await db.select().from(serviceDomains).where(eq(serviceDomains.serviceId, s.id)).orderBy(serviceDomains.createdAt);
  const known = new Set(rows.map((r) => r.host));
  const production: ProductionDomain[] = [
    ...s.domains.filter((h) => !known.has(h)).map((host) => ({ host, state: 'live' as const, error: null, checkedAt: null })),
    ...rows.map((r) => ({ host: r.host, state: r.state, error: r.error, checkedAt: r.checkedAt?.toISOString() ?? null })),
  ];

  const domain = process.env.GUST_DOMAIN;
  const live = await db
    .select({
      branch: deployments.branch,
      commitSha: deployments.commitSha,
      message: deployments.message,
      author: deployments.author,
    })
    .from(deployments)
    .where(and(eq(deployments.serviceId, s.id), eq(deployments.state, 'live')))
    .orderBy(desc(deployments.createdAt));
  const liveBranches = new Set(live.map((l) => l.branch));
  // Newest live deploy per branch: where its build came from.
  const latest = new Map<string, (typeof live)[number]>();
  for (const l of live) if (l.branch && !latest.has(l.branch)) latest.set(l.branch, l);
  const branchPreviews: PreviewDomain[] = p.previewBranches.map((branch) => {
    const d = latest.get(branch);
    return {
      branch,
      host: domain ? previewHost(branch, p.slug, domain) : null,
      live: liveBranches.has(branch),
      commit: d ? { sha: d.commitSha, message: d.message, author: d.author } : null,
    };
  });
  // Open pull requests whose preview runs on this service right now.
  const prs = await db
    .select({ number: pullRequests.number, title: pullRequests.title, author: pullRequests.author })
    .from(pullRequests)
    .where(and(eq(pullRequests.projectId, p.id), eq(pullRequests.state, 'open')))
    .orderBy(desc(pullRequests.updatedAt));
  const prPreviews: PreviewDomain[] = prs
    .filter((pr) => liveBranches.has(`pr-${pr.number}`))
    .map((pr) => ({
      branch: `pr-${pr.number}`,
      host: domain ? previewHost(`pr-${pr.number}`, p.slug, domain) : null,
      live: true,
      pr: { number: pr.number, title: pr.title, author: pr.author },
    }));
  const previews = [...branchPreviews, ...prPreviews];

  return { serverIp: serverIp(), cnameTarget: domain ?? null, production, previews };
}

export class DomainError extends Error {}

export async function addDomain({ s, p }: ServiceRow, raw: string, actor: string) {
  const host = raw.trim().toLowerCase().replace(/\.$/, '');
  if (!HOSTNAME.test(host)) throw new DomainError('Enter a hostname like app.example.com, without https:// or a path.');
  const own = process.env.GUST_DOMAIN;
  if (own && (host === own || host.endsWith(`.${own}`)))
    throw new DomainError(`Hosts under ${own} belong to Gust and previews. Use a domain of your own.`);
  const [taken] = await db.select({ id: services.id }).from(services).where(sql`${host} = ANY(${services.domains})`);
  const [pending] = await db.select({ id: serviceDomains.id }).from(serviceDomains).where(eq(serviceDomains.host, host));
  if (taken || pending) throw new DomainError(`${host} is already added to a service.`);

  await db.insert(serviceDomains).values({ id: `dom_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`, serviceId: s.id, host });
  await db.insert(auditEvents).values({ actor, action: 'domain.add', target: `${p.slug}/${s.name}`, detail: { host } });
  return host;
}

/**
 * Removes a domain. When it was routed, it keeps serving until the next
 * production deploy; returns the live tag to redeploy then, or null.
 */
export async function removeDomain({ s, p }: ServiceRow, host: string, actor: string) {
  const [row] = await db
    .delete(serviceDomains)
    .where(and(eq(serviceDomains.serviceId, s.id), eq(serviceDomains.host, host)))
    .returning();
  const routed = s.domains.includes(host);
  if (!row && !routed) return { found: false, redeployTag: null };
  if (routed)
    await db
      .update(services)
      .set({ domains: s.domains.filter((h) => h !== host) })
      .where(eq(services.id, s.id));
  await db.insert(auditEvents).values({ actor, action: 'domain.remove', target: `${p.slug}/${s.name}`, detail: { host } });
  if (!routed) return { found: true, redeployTag: null };
  const [live] = await db
    .select({ tag: deployments.tag })
    .from(deployments)
    .where(and(eq(deployments.serviceId, s.id), isNull(deployments.branch), eq(deployments.state, 'live')))
    .orderBy(desc(deployments.createdAt))
    .limit(1);
  return { found: true, redeployTag: live?.tag ?? null };
}
