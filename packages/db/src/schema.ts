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
export const deployTrigger = pgEnum('deploy_trigger', ['push', 'rollback', 'manual', 'preview', 'reconcile']);
/** `all` is production and every preview; a production or preview row with the same key overrides it. */
export const envScope = pgEnum('env_scope', ['all', 'production', 'preview']);
/** A custom production domain on its way to serving: DNS first, then a deploy, then HTTPS. */
export const databaseState = pgEnum('database_state', ['provisioning', 'ready', 'failed', 'deleting']);
/** What a project database is: a Postgres database or a Redis keyspace with its own ACL user. */
export const databaseKind = pgEnum('database_kind', ['postgres', 'redis']);

export const domainState = pgEnum('domain_state', ['pending_dns', 'applying', 'live', 'error']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const projects = pgTable('projects', {
  id: text('id').primaryKey(), // prj_<slug>
  slug: text('slug').notNull().unique(),
  repo: text('repo').notNull(),
  domain: text('domain').notNull(),
  /** Deployed through the engine. Others are sample data until they move over. */
  engine: boolean('engine').notNull().default(false),
  /** owner/name on GitHub. A GitHub Actions token from this repository may deploy the project. */
  githubRepo: text('github_repo'),
  /** Pushes to this branch deploy to production. */
  productionBranch: text('production_branch').notNull().default('main'),
  /** Pushes to these branches deploy as previews, on their own host, apart from production. */
  previewBranches: text('preview_branches').array().notNull().default(sql`'{}'::text[]`),
  /** Icon shown next to the name: a PNG, JPEG, GIF, WebP, ICO or SVG, base64 encoded. Null shows the letter. */
  iconType: text('icon_type'),
  iconData: text('icon_data'),
  /** `auto` came from the site's favicon, `manual` was uploaded, `removed` was cleared by hand and is not fetched again. */
  iconSource: text('icon_source'),
  iconUpdatedAt: timestamp('icon_updated_at', { withTimezone: true }),
  /** Last try to take the icon from the site, so a site without one is not asked on every page view. */
  iconCheckedAt: timestamp('icon_checked_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/** GitHub OIDC tokens already used for a deploy, so a captured token cannot start a second one. */
export const githubTokenUses = pgTable('github_token_uses', {
  jti: text('jti').primaryKey(),
  repository: text('repository').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }).notNull().defaultNow(),
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
    /** Stopped by hand: its containers are off and the worker does not restore them. */
    stopped: boolean('stopped').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('services_project_name').on(t.projectId, t.name)],
);

/**
 * Custom production domains of a service and how far each one is. Only
 * verified hosts are copied into services.domains, which is what a deploy
 * routes, so an unverified name never makes Traefik ask for a certificate.
 */
export const serviceDomains = pgTable(
  'service_domains',
  {
    id: text('id').primaryKey(), // dom_<random>
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    host: text('host').notNull().unique(),
    state: domainState('state').notNull().default('pending_dns'),
    /** Why the last check did not pass, for the UI. */
    error: text('error'),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    /** When DNS passed and the host was added to services.domains; a production deploy after this serves it. */
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('service_domains_service').on(t.serviceId)],
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
    /** Preview branch of this deploy; null for production. */
    branch: text('branch'),
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

/** A database on the shared Postgres cluster, owned by one project. See docs/databases.md. */
export const projectDatabases = pgTable(
  'project_databases',
  {
    id: text('id').primaryKey(), // pdb_<database>
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** The name the project gives it, e.g. `main`. Unique per project. */
    name: text('name').notNull(),
    database: text('database').notNull().unique(),
    role: text('role').notNull().unique(),
    /** AES-256-GCM, same format as env secrets. The plain password is never stored. */
    passwordEncrypted: text('password_encrypted').notNull(),
    kind: databaseKind('kind').notNull().default('postgres'),
    state: databaseState('state').notNull().default('provisioning'),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('project_databases_project_name').on(t.projectId, t.name)],
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

/* ── Sign-in (Better Auth) ──────────────────────────────────────────────
   Table and column names follow Better Auth's model, so its Drizzle
   adapter can use them as they are. */

export const userRole = pgEnum('user_role', ['admin', 'member']);

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  /** admin: everything; member: deploys and logs, no secrets or deletes. */
  role: userRole('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('session_user').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    /** Only for the break-glass account (provider "credential"). */
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user').on(t.userId)],
);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
