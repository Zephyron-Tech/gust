// Takes a custom production domain from "added in the UI" to "serving over
// HTTPS", the way Vercel does: wait until its DNS points at this server, add
// it to the service's routed domains and redeploy the live production image
// (blue/green, no downtime), then check that HTTPS answers.
import { resolve4 } from 'node:dns/promises';

import { RUNNING_STATES } from '@gust/contracts';
import { auditEvents, db, deployments, projects, serviceDomains, services } from '@gust/db';
import { enqueueDeploy } from '@gust/db/queue';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

type Log = (line: string) => void;
type Resolve = (host: string) => Promise<string[]>;
type Probe = (url: string) => Promise<number>;

/** What the DNS of a pending domain says: ready, or why not yet. */
export function dnsVerdict(ips: string[] | null, serverIp: string): { ok: true } | { ok: false; error: string } {
  if (!ips?.length) return { ok: false, error: 'No A record yet. Add the DNS record shown here; it can take a few minutes to spread.' };
  if (ips.includes(serverIp)) return { ok: true };
  return { ok: false, error: `Points to ${ips.join(', ')}, not to this server (${serverIp}).` };
}

const probe: Probe = async (url) => {
  const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  return res.status;
};

const resolveA: Resolve = (host) => resolve4(host);

/** Queues a production deploy of the live image, unless one is running. Returns the new id or null. */
async function redeployProduction(serviceId: string, slug: string, name: string, reason: string) {
  const [busy] = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(and(eq(deployments.serviceId, serviceId), isNull(deployments.branch), inArray(deployments.state, [...RUNNING_STATES])));
  if (busy) return null;
  const [live] = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.serviceId, serviceId), isNull(deployments.branch), eq(deployments.state, 'live')))
    .orderBy(desc(deployments.createdAt))
    .limit(1);
  if (!live) return null;
  const id = `dpl_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  await db.insert(deployments).values({
    id,
    serviceId,
    trigger: 'manual',
    tag: live.tag,
    imageRef: live.imageRef,
    message: reason,
    author: 'Gust',
  });
  await db
    .insert(auditEvents)
    .values({ actor: 'gust', action: 'deploy.start', target: `${slug}/${name}`, detail: { deploymentId: id, reason } });
  await enqueueDeploy(id);
  return id;
}

export async function checkDomains(log: Log, resolve: Resolve = resolveA, check: Probe = probe) {
  const serverIp = process.env.GUST_SERVER_IP?.trim();
  const rows = await db
    .select({ d: serviceDomains, s: services, p: projects })
    .from(serviceDomains)
    .innerJoin(services, eq(serviceDomains.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(inArray(serviceDomains.state, ['pending_dns', 'applying']));

  for (const { d, s, p } of rows) {
    const now = new Date();
    if (d.state === 'pending_dns') {
      if (!serverIp) {
        await db
          .update(serviceDomains)
          .set({ error: 'GUST_SERVER_IP is not set on the worker, so Gust cannot tell where DNS should point.', checkedAt: now })
          .where(eq(serviceDomains.id, d.id));
        continue;
      }
      const ips = await resolve(d.host).catch(() => null);
      const verdict = dnsVerdict(ips, serverIp);
      if (!verdict.ok) {
        await db.update(serviceDomains).set({ error: verdict.error, checkedAt: now }).where(eq(serviceDomains.id, d.id));
        continue;
      }
      // DNS is right: route it from the next production deploy on.
      if (!s.domains.includes(d.host))
        await db
          .update(services)
          .set({ domains: [...s.domains, d.host] })
          .where(eq(services.id, s.id));
      await db
        .update(serviceDomains)
        .set({ state: 'applying', error: null, checkedAt: now, appliedAt: now })
        .where(eq(serviceDomains.id, d.id));
      const id = await redeployProduction(s.id, p.slug, s.name, `Apply domain ${d.host}`);
      log(`domain ${d.host}: DNS points here${id ? `, deploying ${id}` : ', waiting for a production deploy'}`);
      continue;
    }

    // applying: a production deploy that started after the domain was added serves it.
    const applied = d.appliedAt ?? d.createdAt;
    const [latest] = await db
      .select({ id: deployments.id, state: deployments.state, createdAt: deployments.createdAt })
      .from(deployments)
      .where(and(eq(deployments.serviceId, s.id), isNull(deployments.branch)))
      .orderBy(desc(deployments.createdAt))
      .limit(1);
    if (!latest || latest.createdAt < applied) {
      const id = await redeployProduction(s.id, p.slug, s.name, `Apply domain ${d.host}`);
      await db
        .update(serviceDomains)
        .set({
          checkedAt: now,
          error: id || latest ? null : 'No production deployment yet. The domain goes live with the first one.',
          ...(id && { appliedAt: now }),
        })
        .where(eq(serviceDomains.id, d.id));
      continue;
    }
    if ((RUNNING_STATES as readonly string[]).includes(latest.state)) continue;
    if (latest.state === 'failed') {
      await db
        .update(serviceDomains)
        .set({ checkedAt: now, error: `The deploy that applies this domain failed (${latest.id}). Gust tries again with the next one.` })
        .where(eq(serviceDomains.id, d.id));
      continue;
    }
    // Traefik asks Let's Encrypt for the certificate on the first request, so give it a few tries.
    const status = await check(`https://${d.host}${s.healthPath ?? '/'}`).catch((e: Error) => e);
    if (typeof status === 'number' && status < 500) {
      await db.update(serviceDomains).set({ state: 'live', error: null, checkedAt: now }).where(eq(serviceDomains.id, d.id));
      log(`domain ${d.host}: live over HTTPS`);
    } else {
      const why = typeof status === 'number' ? `HTTPS answered ${status}` : `HTTPS not ready yet: ${status.message}`;
      await db.update(serviceDomains).set({ error: why, checkedAt: now }).where(eq(serviceDomains.id, d.id));
    }
  }
}
