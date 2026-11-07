// Gust's database: what should run, and the history of what did. Docker
// labels mirror the ids here, so the engine can always rebuild its view.
import { sql } from 'drizzle-orm';
import { bigserial, boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const serviceType = pgEnum('service_type', ['app', 'stateful']);
export const deployState = pgEnum('deploy_state', [
  'queued',
  'pulling',
  'starting',
  'healthy',
  'live',
  'failed',
  'superseded',
  'cancelled',
]);
export const deployTrigger = pgEnum('deploy_trigger', ['push', 'rollback', 'manual', 'preview']);
export const envScope = pgEnum('env_scope', ['production', 'preview']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const projects = pgTable('projects', {
  id: text('id').primaryKey(), // prj_<slug>
  slug: text('slug').notNull().unique(),
  repo: text('repo').notNull(),
  domain: text('domain').notNull(),
  /** Deployed through the engine. Others are sample data until they move over. */
  engine: boolean('engine').notNull().default(false),
  createdAt: createdAt(),
});

export const services = pgTable(
  'services',
  {
    id: text('id').primaryKey(), // svc_<project>_<name>
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: serviceType('type').notNull(),
    /** Repository in the registry, e.g. demo/hello; for stateful services the full image. */
    image: text('image').notNull(),
    port: integer('port'),
    healthPath: text('health_path'),
    domains: text('domains').array().notNull().default(sql`'{}'::text[]`),
    cpu: real('cpu').notNull().default(1),
    memoryMb: integer('memory_mb').notNull().default(512),
    keepImages: integer('keep_images').notNull().default(5),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('services_project_name').on(t.projectId, t.name)],
);

export const deployments = pgTable(
  'deployments',
  {
    id: text('id').primaryKey(), // dpl_<random>
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    state: deployState('state').notNull().default('queued'),
    trigger: deployTrigger('trigger').notNull(),
    tag: text('tag').notNull(),
    imageRef: text('image_ref').notNull(),
    message: text('message').notNull(),
    author: text('author').notNull(),
    commitSha: text('commit_sha'),
    rollbackOf: text('rollback_of'),
    containerId: text('container_id'),
    error: text('error'),
    createdAt: createdAt(),
    liveAt: timestamp('live_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('deployments_service_created').on(t.serviceId, t.createdAt)],
);

export const deploymentLogs = pgTable(
  'deployment_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    deploymentId: text('deployment_id')
      .notNull()
      .references(() => deployments.id, { onDelete: 'cascade' }),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
    phase: text('phase').notNull(),
    line: text('line').notNull(),
  },
  (t) => [index('deployment_logs_deployment').on(t.deploymentId, t.id)],
);

export const envVars = pgTable(
  'env_vars',
  {
    id: text('id').primaryKey(),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    scope: envScope('scope').notNull().default('production'),
    isSecret: boolean('is_secret').notNull().default(false),
    /** AES-256-GCM: iv.ciphertext.tag, base64. Plain text when not secret. */
    value: text('value').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('env_vars_service_key_scope').on(t.serviceId, t.key, t.scope)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    target: text('target').notNull(),
    detail: jsonb('detail'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_events_at').on(t.at)],
);
