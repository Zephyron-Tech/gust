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

/** One route per service; a preview branch gets a route of its own, so it never shares servers with production. */
export const routeName = (project: string, service: string, branch?: string | null) =>
  branch ? `${project}-${service}-${branch}` : `${project}-${service}`;

// On the VPS every route is HTTPS with a Let's Encrypt certificate from this
// Traefik resolver; locally it is unset and routes stay on plain HTTP.
const tlsResolver = () => process.env.GUST_TLS_RESOLVER || undefined;

// Zones with a wildcard DNS record (GUST_WILDCARD_ZONES, e.g. `zephyron.tech,gust.zephyron.tech`).
// A host one label under such a zone gets one shared `*.zone` certificate, issued over DNS-01
// by GUST_WILDCARD_RESOLVER (WEDOS), instead of an HTTP-01 certificate of its own.
const wildcardZones = () =>
  (process.env.GUST_WILDCARD_ZONES ?? '')
    .split(',')
    .map((z) => z.trim().toLowerCase())
    .filter(Boolean);
const wildcardResolver = () => process.env.GUST_WILDCARD_RESOLVER || 'wedos';

/** `*.zone` when `host` is exactly one label under one of `zones`, else null. */
export function wildcardFor(host: string, zones: string[]): string | null {
  for (const zone of zones) {
    const suffix = `.${zone}`;
    if (!host.endsWith(suffix)) continue;
    const label = host.slice(0, -suffix.length);
    if (label && !label.includes('.')) return `*${suffix}`;
  }
  return null;
}

interface Router {
  rule: string;
  entryPoints: string[];
  service: string;
  tls?: { certResolver: string; domains?: { main: string }[] };
}

interface TraefikConfig {
  http: {
    routers: Record<string, Router>;
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
    const name = routeName(project, service, c.Labels[LABEL.branch]);
    const resolver = tlsResolver();
    const zones = resolver ? wildcardZones() : [];
    // Hosts under a wildcard zone share a router with the wildcard certificate; the rest keep HTTP-01.
    const groups = new Map<string | null, string[]>();
    for (const d of domains) {
      const wild = wildcardFor(d, zones);
      groups.set(wild, [...(groups.get(wild) ?? []), d]);
    }
    for (const [wild, hosts] of groups) {
      const router = wild ? `${name}-wild-${wild.slice(2).replace(/\./g, '-')}` : name;
      cfg.http.routers[router] = {
        rule: hosts.map((h) => `Host(\`${h}\`)`).join(' || '),
        entryPoints: [process.env.GUST_ENTRYPOINT ?? (resolver ? 'websecure' : 'web')],
        service: name,
        ...(resolver && {
          tls: wild ? { certResolver: wildcardResolver(), domains: [{ main: wild }] } : { certResolver: resolver },
        }),
      };
    }
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
