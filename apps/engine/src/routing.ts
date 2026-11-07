// Traefik's routing comes from the engine, not from Docker labels: Traefik
// polls GET /internal/traefik every second (HTTP provider). The config is
// rebuilt from the running containers' gust.* labels, so it survives an
// engine restart, plus one piece of memory: which containers are draining.
//
// That is what makes deploys lossless. A container is taken out of the load
// balancer, Traefik confirms it, in-flight requests finish, and only then is
// the container stopped. Apps need no graceful shutdown of their own.
import { LABEL } from '@gust/contracts';

import { docker, EDGE_NETWORK } from './docker';

const draining = new Set<string>();
export const drain = (id: string) => draining.add(id);
export const undrain = (id: string) => draining.delete(id);

const traefikApi = () => process.env.TRAEFIK_API ?? 'http://127.0.0.1:8081';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const routeName = (project: string, service: string) => `${project}-${service}`;

interface TraefikConfig {
  http: {
    routers: Record<string, { rule: string; entryPoints: string[]; service: string }>;
    services: Record<string, { loadBalancer: { servers: { url: string }[]; passHostHeader: boolean } }>;
  };
}

/** The dynamic config Traefik should run right now. */
export async function traefikConfig(): Promise<TraefikConfig | Record<string, never>> {
  const list = await docker.listContainers({ filters: { label: [`${LABEL.managed}=true`, 'gust.domains'], status: ['running'] } });
  const cfg: TraefikConfig = { http: { routers: {}, services: {} } };
  for (const c of list) {
    // Only healthy containers take traffic, and never one that is draining.
    if (draining.has(c.Id) || !/\(healthy\)/.test(c.Status)) continue;
    const project = c.Labels[LABEL.project];
    const service = c.Labels[LABEL.service];
    const domains = c.Labels['gust.domains']?.split(',').filter(Boolean) ?? [];
    const port = c.Labels['gust.port'];
    const ip = c.NetworkSettings?.Networks?.[EDGE_NETWORK]?.IPAddress;
    if (!project || !service || !domains.length || !port || !ip) continue;
    const name = routeName(project, service);
    cfg.http.routers[name] = {
      rule: domains.map((d) => `Host(\`${d}\`)`).join(' || '),
      entryPoints: [process.env.GUST_ENTRYPOINT ?? 'web'],
      service: name,
    };
    cfg.http.services[name] ??= { loadBalancer: { servers: [], passHostHeader: true } };
    const svc = cfg.http.services[name];
    svc.loadBalancer.servers.push({ url: `http://${ip}:${port}` });
  }
  // Traefik rejects empty router or service maps, so nothing routed means {}.
  return Object.keys(cfg.http.routers).length ? cfg : {};
}

/** Waits until Traefik's live config for `name` satisfies `check`. */
export async function waitTraefik(name: string, check: (urls: string[]) => boolean, timeoutS = 15) {
  const until = Date.now() + timeoutS * 1000;
  while (Date.now() < until) {
    const res = await fetch(`${traefikApi()}/api/http/services/${name}@http`).catch(() => null);
    const urls = res?.ok
      ? (((await res.json()) as { loadBalancer?: { servers?: { url: string }[] } }).loadBalancer?.servers ?? []).map((s) => s.url)
      : [];
    if (check(urls)) return true;
    await sleep(250);
  }
  return false;
}
