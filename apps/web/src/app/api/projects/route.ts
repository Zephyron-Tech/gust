import { envScope, previewHost } from '@gust/contracts';
import { auditEvents, db, envVars, projects, serviceDomains, services } from '@gust/db';
import { validateNewProject } from '@gust/db/project-rules';
import { encryptSecret } from '@gust/db/secrets';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/lib/auth';
import { getProjects } from '@/lib/data';
import { ownerAllowed } from '@/lib/github-repo-logic';

export const dynamic = 'force-dynamic';

const envList = z
  .array(
    z.object({
      key: z.string().regex(/^[A-Z_][A-Z0-9_]{0,127}$/, 'Use capitals, digits and underscores, e.g. DATABASE_URL'),
      value: z.string().max(8192),
      scope: envScope,
      isSecret: z.boolean(),
    }),
  )
  .max(200);

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;

// Creates a project with its first service from an imported repository. It
// is served on <slug>.<GUST_DOMAIN> right away; a custom domain, when given,
// waits for its DNS like one added in the Domains tab. Admins only.
// Every project in short, for the sidebar, the command menu and to tell real
// deploys from sample ones: its health and the page its name links to.
export async function GET(req: Request) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const list = await getProjects();
  return Response.json(
    list.map((p) => {
      const first = p.services.find((s) => s.type === 'app') ?? p.services[0];
      return {
        slug: p.slug,
        engine: p.engine === true,
        health: p.health,
        domain: p.domain,
        icon: p.icon,
        href: first ? `/projects/${p.slug}/${first.name}/${first.type === 'stateful' ? 'settings' : 'deployments'}` : `/projects/${p.slug}`,
      };
    }),
  );
}

export async function POST(req: Request) {
  const u = await requireUser(req, 'admin');
  if (u instanceof Response) return u;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return Response.json({ error: 'Send the form as JSON' }, { status: 400 });
  const checked = validateNewProject(body as Record<string, unknown>);
  const errors: Record<string, string> = checked.ok ? {} : { ...checked.errors };
  const env = envList.safeParse((body as { env?: unknown }).env ?? []);
  if (!env.success) errors.env = env.error.issues[0]?.message ?? 'Check the variables';
  if (checked.ok && !ownerAllowed(checked.value.repo)) errors.repo = 'Gust only deploys repositories of its own organisation';
  const gustDomain = process.env.GUST_DOMAIN;
  if (checked.ok && !checked.value.domain && !gustDomain)
    errors.domain = 'Enter a domain: GUST_DOMAIN is not set, so there is no automatic host';
  if (!checked.ok || !env.success || Object.keys(errors).length)
    return Response.json({ error: 'Check the highlighted fields', errors }, { status: 400 });
  const v = checked.value;
  const keys = env.data.map((e) => `${e.key}/${e.scope}`);
  if (new Set(keys).size !== keys.length)
    return Response.json(
      { error: 'Check the highlighted fields', errors: { env: 'A key is set twice for the same environment' } },
      { status: 400 },
    );

  // The host production is served on now; a custom domain joins it once its DNS is right.
  const host = gustDomain ? `${v.slug}.${gustDomain}` : (v.domain as string);
  const custom = gustDomain ? v.domain : null;

  const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, v.slug));
  if (existing) return Response.json({ error: `Project ${v.slug} already exists`, errors: { slug: 'Already taken' } }, { status: 409 });
  const [sameRepo] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.githubRepo, v.repo));
  if (sameRepo)
    return Response.json(
      { error: `${v.repo} is already imported as ${sameRepo.slug}`, errors: { repo: `Already imported as ${sameRepo.slug}` } },
      { status: 409 },
    );
  for (const h of [host, custom].filter(Boolean) as string[]) {
    const [routed] = await db.select({ id: services.id }).from(services).where(sql`${h} = ANY(${services.domains})`);
    const [pending] = await db.select({ id: serviceDomains.id }).from(serviceDomains).where(eq(serviceDomains.host, h));
    if (routed || pending) {
      const field = h === host ? 'slug' : 'domain';
      return Response.json({ error: `${h} is already used by another service`, errors: { [field]: `${h} is taken` } }, { status: 409 });
    }
  }
  // <slug>.<domain> must not be another project's preview host (<branch>-<project>.<domain>).
  if (gustDomain) {
    const all = await db.select({ slug: projects.slug, previews: projects.previewBranches }).from(projects);
    const clash = all.find((p) => p.previews.some((b) => previewHost(b, p.slug, gustDomain) === host));
    if (clash)
      return Response.json(
        { error: `${host} is the preview host of ${clash.slug}`, errors: { slug: `Clashes with a preview of ${clash.slug}` } },
        { status: 409 },
      );
  }

  const serviceId = `svc_${v.slug}_${v.service}`;
  try {
    // One transaction: a project never exists without its service.
    await db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id: `prj_${v.slug}`,
        slug: v.slug,
        repo: v.repo,
        domain: host,
        engine: true,
        githubRepo: v.repo,
        productionBranch: v.branch,
        previewBranches: v.previewBranches,
      });
      await tx.insert(services).values({
        id: serviceId,
        projectId: `prj_${v.slug}`,
        name: v.service,
        type: 'app',
        image: `${v.slug}/${v.service}`,
        port: v.port,
        healthPath: v.healthPath,
        domains: [host],
        memoryMb: v.memoryMb,
        cpu: v.cpu,
      });
      if (custom) await tx.insert(serviceDomains).values({ id: id('dom'), serviceId, host: custom });
      if (env.data.length)
        await tx.insert(envVars).values(
          env.data.map((e) => ({
            id: id('env'),
            serviceId,
            key: e.key,
            scope: e.scope,
            isSecret: e.isSecret,
            value: e.isSecret ? encryptSecret(e.value) : e.value,
          })),
        );
      const target = `${v.slug}/${v.service}`;
      await tx.insert(auditEvents).values([
        {
          actor: u.email,
          action: 'project.create',
          target: v.slug,
          detail: { repo: v.repo, branch: v.branch, previews: v.previewBranches },
        },
        { actor: u.email, action: 'service.create', target, detail: { port: v.port, domains: [host], image: `${v.slug}/${v.service}` } },
        ...(custom ? [{ actor: u.email, action: 'domain.add', target, detail: { host: custom } }] : []),
        // The audit names the keys, never the values.
        ...env.data.map((e) => ({ actor: u.email, action: 'env.set', target, detail: { key: e.key, scope: e.scope, secret: e.isSecret } })),
      ]);
    });
  } catch (e) {
    // Two requests with the same slug at once: the second hits the unique key.
    if ((e as { code?: string }).code === '23505') {
      return Response.json({ error: `Project ${v.slug} already exists`, errors: { slug: 'Already taken' } }, { status: 409 });
    }
    throw e;
  }

  return Response.json({ slug: v.slug, service: v.service, host }, { status: 201 });
}
