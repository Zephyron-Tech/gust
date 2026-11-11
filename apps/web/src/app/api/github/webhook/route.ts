// GitHub App webhook. Keeps each pull request of an engine project up to date and removes the
// preview of a PR that closed. Signed with GITHUB_WEBHOOK_SECRET; no session, no OIDC.
import { db, githubWebhookDeliveries, projects, pullRequests } from '@gust/db';
import { enqueuePreviewRemove } from '@gust/db/queue';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { signatureValid } from '@/lib/github-webhook';

export const dynamic = 'force-dynamic';

const payload = z.object({
  action: z.string(),
  repository: z.object({ full_name: z.string() }),
  pull_request: z
    .object({
      number: z.number().int().positive(),
      title: z.string(),
      user: z.object({ login: z.string() }),
      head: z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/), repo: z.object({ full_name: z.string() }).nullable() }),
    })
    .optional(),
});

const OPEN_ACTIONS = ['opened', 'reopened', 'synchronize'];
const NO_CONTENT = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: 'The webhook secret is not set on this server' }, { status: 503 });

  const body = await req.text();
  if (!signatureValid(secret, body, req.headers.get('x-hub-signature-256'))) {
    return Response.json({ error: 'Bad signature' }, { status: 401 });
  }
  const deliveryId = req.headers.get('x-github-delivery') ?? '';
  const event = req.headers.get('x-github-event') ?? '';
  if (!deliveryId) return Response.json({ error: 'No delivery id' }, { status: 400 });

  // A delivery already handled does nothing the second time. It is recorded only after it worked,
  // so a failed one is retried by GitHub.
  const [seen] = await db
    .select({ deliveryId: githubWebhookDeliveries.deliveryId })
    .from(githubWebhookDeliveries)
    .where(eq(githubWebhookDeliveries.deliveryId, deliveryId));
  if (seen) return NO_CONTENT();

  if (event === 'pull_request') {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return Response.json({ error: 'Not JSON' }, { status: 400 });
    }
    const parsed = payload.safeParse(json);
    if (!parsed.success || !parsed.data.pull_request) return Response.json({ error: 'Not a pull request event' }, { status: 400 });
    await handlePullRequest(parsed.data.action, parsed.data.repository.full_name, parsed.data.pull_request);
  }

  await db.insert(githubWebhookDeliveries).values({ deliveryId, event }).onConflictDoNothing();
  return NO_CONTENT();
}

type PullRequestPayload = NonNullable<z.infer<typeof payload>['pull_request']>;

async function handlePullRequest(action: string, repo: string, pr: PullRequestPayload) {
  const [project] = await db
    .select({ id: projects.id, slug: projects.slug })
    .from(projects)
    .where(and(sql`lower(${projects.githubRepo}) = lower(${repo})`, eq(projects.engine, true)));
  if (!project) return;

  const closed = action === 'closed';
  if (!closed && !OPEN_ACTIONS.includes(action)) return;

  const [existing] = await db
    .select({ state: pullRequests.state })
    .from(pullRequests)
    .where(and(eq(pullRequests.projectId, project.id), eq(pullRequests.number, pr.number)));
  // A late synchronize for a PR that already closed must not bring its preview back.
  if (existing?.state === 'closed' && action === 'synchronize') return;

  const row = {
    state: closed ? 'closed' : 'open',
    headSha: pr.head.sha,
    headRepo: pr.head.repo?.full_name ?? '',
    title: pr.title.slice(0, 300),
    author: pr.user.login,
    updatedAt: new Date(),
  };
  await db
    .insert(pullRequests)
    .values({ id: `pr_${project.slug}_${pr.number}`, projectId: project.id, number: pr.number, ...row })
    .onConflictDoUpdate({ target: [pullRequests.projectId, pullRequests.number], set: row });

  if (closed) await enqueuePreviewRemove({ slug: project.slug, number: pr.number, reason: 'closed' });
}
