// Adds and changes projects and services from the command line, until the UI
// can. On the server: `gust project <command>`; locally:
//   pnpm --filter @gust/db exec tsx --env-file=.env src/project-cli.ts <command>
//
//   list
//   add <slug> --repo owner/name --service web --port 3000 --domain app.example.com
//       [--branch main] [--health /healthz] [--memory 512] [--cpu 1]
//   service <slug> <service> --port 3000 --domain a.example.com[,b.example.com]
//       [--health /healthz] [--memory 512] [--cpu 1]
//   set <slug> [--repo owner/name] [--branch main] [--domain example.com] [--preview dev,staging]
//
// Every change writes an audit_events row with actor "cli".
import { parseArgs } from 'node:util';

import { and, asc, eq } from 'drizzle-orm';

import { auditEvents, db, pool, projects, services } from './index';
import { DOMAIN, REPO, SLUG } from './project-rules';

class UsageError extends Error {}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    repo: { type: 'string' },
    branch: { type: 'string' },
    preview: { type: 'string' },
    service: { type: 'string' },
    port: { type: 'string' },
    domain: { type: 'string' },
    health: { type: 'string' },
    memory: { type: 'string' },
    cpu: { type: 'string' },
  },
});

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined || value === '') throw new UsageError(`${what} is required`);
  return value;
}

function check(value: string, re: RegExp, what: string) {
  if (!re.test(value)) throw new UsageError(`${what} "${value}" is not valid`);
  return value;
}

function domains(raw: string) {
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .map((d) => check(d, DOMAIN, 'Domain'));
}

function int(raw: string | undefined, what: string, min: number, max: number) {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new UsageError(`${what} must be a whole number from ${min} to ${max}`);
  return n;
}

/** Preview branches as a list; an empty value clears them. */
function previewList(raw: string) {
  return raw
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => check(b, /^[\w./-]{1,100}$/, 'Preview branch'));
}

function serviceFields() {
  const cpu = values.cpu === undefined ? undefined : Number(values.cpu);
  if (cpu !== undefined && !(cpu > 0 && cpu <= 64)) throw new UsageError('CPU must be a number above 0');
  const health = values.health;
  if (health !== undefined && !health.startsWith('/')) throw new UsageError('Health path must start with /');
  return {
    port: int(values.port, 'Port', 1, 65535),
    domains: values.domain === undefined ? undefined : domains(values.domain),
    healthPath: health,
    memoryMb: int(values.memory, 'Memory', 64, 65536),
    cpu,
  };
}

const audit = (action: string, target: string, detail: Record<string, unknown>) =>
  db.insert(auditEvents).values({ actor: 'cli', action, target, detail });

async function list() {
  const rows = await db
    .select({ project: projects, service: services })
    .from(projects)
    .leftJoin(services, eq(services.projectId, projects.id))
    .where(eq(projects.engine, true))
    .orderBy(asc(projects.slug), asc(services.name));
  if (!rows.length) return console.log('No projects yet. Add one with: gust project add <slug> …');
  for (const { project: p, service: s } of rows) {
    const svc = s ? `${s.name}  port ${s.port ?? '-'}  ${s.domains.join(', ') || 'no domain'}  image ${s.image}` : 'no services';
    const previews = p.previewBranches.length ? `  previews ${p.previewBranches.join(', ')}` : '';
    console.log(`${p.slug}  ${p.githubRepo ?? '-'}@${p.productionBranch}${previews}  ${svc}`);
  }
}

async function addService(slug: string, name: string) {
  check(name, SLUG, 'Service name');
  const f = serviceFields();
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
  if (!project) throw new UsageError(`Project ${slug} does not exist`);
  const row = {
    id: `svc_${slug}_${name}`,
    projectId: project.id,
    name,
    type: 'app' as const,
    image: `${slug}/${name}`,
    port: need(f.port, '--port'),
    healthPath: f.healthPath ?? null,
    domains: f.domains ?? [],
    ...(f.memoryMb !== undefined && { memoryMb: f.memoryMb }),
    ...(f.cpu !== undefined && { cpu: f.cpu }),
  };
  const [existing] = await db
    .select()
    .from(services)
    .where(and(eq(services.projectId, project.id), eq(services.name, name)));
  if (existing) {
    const change = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined));
    await db.update(services).set(change).where(eq(services.id, existing.id));
    await audit('service.update', `${slug}/${name}`, change);
    console.log(`updated ${slug}/${name}`);
  } else {
    await db.insert(services).values(row);
    await audit('service.create', `${slug}/${name}`, { port: row.port, domains: row.domains, image: row.image });
    console.log(`added ${slug}/${name}: image ${row.image}, port ${row.port}, ${row.domains.join(', ') || 'no domain'}`);
  }
}

async function add(slug: string) {
  check(slug, SLUG, 'Project slug');
  const repo = check(need(values.repo, '--repo'), REPO, 'Repository');
  const service = need(values.service, '--service');
  const domain = domains(need(values.domain, '--domain'))[0];
  const [existing] = await db.select().from(projects).where(eq(projects.slug, slug));
  if (existing) throw new UsageError(`Project ${slug} already exists; use "gust project set" or "gust project service"`);
  await db.insert(projects).values({
    id: `prj_${slug}`,
    slug,
    repo,
    domain: need(domain, '--domain'),
    engine: true,
    githubRepo: repo,
    productionBranch: values.branch ?? 'main',
    previewBranches: values.preview === undefined ? [] : previewList(values.preview),
  });
  await audit('project.create', slug, { repo, branch: values.branch ?? 'main' });
  console.log(`added project ${slug} (${repo}@${values.branch ?? 'main'})`);
  await addService(slug, service);
}

async function set(slug: string) {
  const change: Partial<typeof projects.$inferInsert> = {};
  if (values.repo) change.repo = change.githubRepo = check(values.repo, REPO, 'Repository');
  if (values.branch) change.productionBranch = values.branch;
  if (values.domain) change.domain = domains(values.domain)[0];
  if (values.preview !== undefined) change.previewBranches = previewList(values.preview);
  if (!Object.keys(change).length) throw new UsageError('Nothing to change: pass --repo, --branch, --domain or --preview');
  const updated = await db.update(projects).set(change).where(eq(projects.slug, slug)).returning({ id: projects.id });
  if (!updated.length) throw new UsageError(`Project ${slug} does not exist`);
  await audit('project.update', slug, change);
  console.log(`updated ${slug}`);
}

const [command, a, b] = positionals;
try {
  if (command === 'list') await list();
  else if (command === 'add') await add(need(a, 'Project slug'));
  else if (command === 'service') await addService(need(a, 'Project slug'), need(b, 'Service name'));
  else if (command === 'set') await set(need(a, 'Project slug'));
  else throw new UsageError('Commands: list, add, service, set');
} catch (e) {
  if (!(e instanceof UsageError)) throw e;
  console.error(`gust project: ${e.message}`);
  process.exitCode = 64;
} finally {
  await pool.end();
}
