// Shared shapes between the UI, the worker and the engine. Schemas are zod so
// the same definition validates API input and gives the TypeScript type.
import { z } from 'zod';

export const deployState = z.enum(['queued', 'pulling', 'starting', 'healthy', 'live', 'failed', 'superseded', 'cancelled']);
export type DeployState = z.infer<typeof deployState>;

/** States in which a deployment is still moving. */
export const RUNNING_STATES: readonly DeployState[] = ['queued', 'pulling', 'starting', 'healthy'];

export const serviceType = z.enum(['app', 'stateful']);
export type ServiceType = z.infer<typeof serviceType>;

export const health = z.enum(['live', 'failed', 'stopped']);
export type Health = z.infer<typeof health>;

export const service = z.object({
  name: z.string(),
  type: serviceType,
  image: z.string(),
  port: z.number().int().optional(),
  healthPath: z.string().optional(),
  /** Hostnames routed to this service. */
  domains: z.array(z.string()).optional(),
  cpu: z.number(),
  memoryMb: z.number().int(),
  health,
});
export type Service = z.infer<typeof service>;

export const project = z.object({
  slug: z.string(),
  repo: z.string(),
  domain: z.string(),
  health,
  lastDeploy: z.string(),
  services: z.array(service),
  /** Deployed for real through the engine; the rest is sample data. */
  engine: z.boolean().optional(),
  productionBranch: z.string().optional(),
  previewBranches: z.array(z.string()).optional(),
});
export type Project = z.infer<typeof project>;

export const logLine = z.object({ ts: z.string(), phase: z.string(), line: z.string() });
export type LogLine = z.infer<typeof logLine>;

export const deployment = z.object({
  id: z.string(),
  project: z.string(),
  service: z.string(),
  sha: z.string(),
  message: z.string(),
  author: z.string(),
  branch: z.string(),
  trigger: z.enum(['push', 'rollback', 'manual', 'preview', 'reconcile']),
  state: deployState,
  createdAt: z.string(),
  /** True for a deploy of a preview branch; absent or false is production. */
  preview: z.boolean().optional(),
  /** Where a preview is served; absent for production. */
  previewUrl: z.string().optional(),
  duration: z.string().optional(),
  error: z.string().optional(),
  logs: z.array(logLine),
});
export type Deployment = z.infer<typeof deployment>;

export const domain = z.object({
  host: z.string(),
  service: z.string(),
  tls: z.enum(['http01', 'dns01']),
  renewsInDays: z.number().int(),
});
export type Domain = z.infer<typeof domain>;

/** Where an env var applies: `all` is production and every preview. */
export const envScope = z.enum(['all', 'production', 'preview']);
export type EnvScope = z.infer<typeof envScope>;

export const envVar = z.object({
  key: z.string(),
  value: z.string(),
  secret: z.boolean(),
  scope: envScope,
});
export type EnvVar = z.infer<typeof envVar>;

export const observedStack = z.object({
  name: z.string(),
  path: z.string(),
  domain: z.string(),
  memoryMb: z.number(),
  containers: z.array(z.string()),
  health,
});
export type ObservedStack = z.infer<typeof observedStack>;

export const registryRepo = z.object({ name: z.string(), tags: z.number().int(), sizeMb: z.number(), robot: z.string() });
export type RegistryRepo = z.infer<typeof registryRepo>;

export const alertState = z.enum(['pending', 'firing', 'resolved']);
export const alert = z.object({
  id: z.string(),
  rule: z.string(),
  severity: z.enum(['warning', 'critical']),
  state: alertState,
  detail: z.string(),
  startedAt: z.string(),
  resolvedAt: z.string().optional(),
});
export type Alert = z.infer<typeof alert>;

/** Body of POST /api/deploy, sent by GitHub Actions with an OIDC token. */
export const deployRequest = z.object({
  service: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'project/service'),
  tag: z.string().min(1),
});
export type DeployRequest = z.infer<typeof deployRequest>;

/** A health check path: starts with /, URL characters only, no shell or quote characters. */
export const HEALTH_PATH = /^\/[A-Za-z0-9._~\-/?=&%+:@,]{0,199}$/;

/** A host Traefik may route: DNS labels only. Looser than HOSTNAME, so local names like hello.localhost pass. */
export const ROUTE_HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/* ── Engine ─────────────────────────────────────────────────────────────
   The worker sends a deploy spec; the engine answers with a stream of events. */

export const deploySpec = z.object({
  deploymentId: z.string().regex(/^dpl_[a-z0-9]+$/),
  project: z.string().regex(/^[a-z0-9-]+$/),
  service: z.string().regex(/^[a-z0-9-]+$/),
  image: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  // The path goes into a shell health check and the hosts into a Traefik rule,
  // so both are held to a strict shape here, whatever the caller checked.
  healthPath: z.string().regex(HEALTH_PATH).default('/'),
  domains: z.array(z.string().regex(ROUTE_HOST)).default([]),
  env: z.record(z.string(), z.string()).default({}),
  cpu: z.number().positive().default(1),
  memoryMb: z.number().int().positive().default(512),
  /** Seconds to wait for the new container to report healthy. */
  healthTimeout: z.number().int().positive().default(60),
  /** Set for a preview deploy: its own container and route, apart from production. */
  branch: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});
export type DeploySpec = z.infer<typeof deploySpec>;

export const deployEvent = z.object({
  ts: z.string(),
  phase: z.enum(['queue', 'pull', 'start', 'health', 'route', 'drain', 'live', 'fail']),
  state: deployState.optional(),
  line: z.string(),
  containerId: z.string().optional(),
});
export type DeployEvent = z.infer<typeof deployEvent>;

/** Labels every container Gust manages carries, so state can be rebuilt from Docker. */
export const LABEL = {
  managed: 'gust.managed',
  project: 'gust.project',
  service: 'gust.service',
  deployment: 'gust.deployment',
  type: 'gust.type',
  branch: 'gust.branch',
} as const;

/** A branch name as one DNS label: lowercase letters, digits and dashes, at most 40 characters. */
export const branchLabel = (branch: string) =>
  branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');

/** Public host of a preview, one label under the wildcard: <branch>-<project>.<domain>. */
export const previewHost = (branch: string, project: string, domain: string) => `${branchLabel(branch)}-${project}.${domain}`;

/**
 * Which deploy a GitHub run means, from its ref. `null` branch is production;
 * a preview branch deploys as a preview. Anything else is refused.
 */
export function deployTarget(ref: string, productionBranch: string, previewBranches: string[]): { branch: string | null } | null {
  if (ref === `refs/heads/${productionBranch}`) return { branch: null };
  const preview = previewBranches.find((b) => ref === `refs/heads/${b}`);
  return preview ? { branch: preview } : null;
}

/** The environment a deploy runs in: production, or the preview of one branch. */
export type Environment = { kind: 'production' } | { kind: 'preview'; branch: string };

export function environmentOf(d: Pick<Deployment, 'preview' | 'trigger' | 'branch'>): Environment {
  return d.preview || d.trigger === 'preview' ? { kind: 'preview', branch: d.branch } : { kind: 'production' };
}

/** Whether a variable of `scope` reaches `env`. */
export const scopeApplies = (scope: EnvScope, env: 'production' | 'preview') => scope === 'all' || scope === env;

/**
 * The variables one deploy gets: every row whose scope applies, and where a
 * key is set both for `all` and for the environment itself, the specific one.
 */
export function pickEnv<T extends { key: string; scope: EnvScope }>(rows: T[], env: 'production' | 'preview'): T[] {
  const out = new Map<string, T>();
  for (const r of rows) {
    if (!scopeApplies(r.scope, env)) continue;
    const prev = out.get(r.key);
    if (!prev || prev.scope === 'all') out.set(r.key, r);
  }
  return [...out.values()];
}

/** A hostname someone can point at Gust: lowercase labels, a dot, no wildcard. */
export const HOSTNAME = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
