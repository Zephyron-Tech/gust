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
  trigger: z.enum(['push', 'rollback', 'manual', 'preview']),
  state: deployState,
  createdAt: z.string(),
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

export const envVar = z.object({
  key: z.string(),
  value: z.string(),
  secret: z.boolean(),
  scope: z.enum(['production', 'preview']),
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

/* ── Engine ─────────────────────────────────────────────────────────────
   The worker sends a deploy spec; the engine answers with a stream of events. */

export const deploySpec = z.object({
  deploymentId: z.string().regex(/^dpl_[a-z0-9]+$/),
  project: z.string().regex(/^[a-z0-9-]+$/),
  service: z.string().regex(/^[a-z0-9-]+$/),
  image: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  healthPath: z.string().startsWith('/').default('/'),
  domains: z.array(z.string().min(1)).default([]),
  env: z.record(z.string(), z.string()).default({}),
  cpu: z.number().positive().default(1),
  memoryMb: z.number().int().positive().default(512),
  /** Seconds to wait for the new container to report healthy. */
  healthTimeout: z.number().int().positive().default(60),
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
} as const;
