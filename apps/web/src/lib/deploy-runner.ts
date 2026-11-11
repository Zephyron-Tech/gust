import 'server-only';

// Starts a deploy: checks the service, writes the deployment row and an audit
// event, and puts a job on the queue. apps/worker picks it up, talks to the
// engine and moves the state along; the UI reads the rows back.
import { PR_BRANCH, RUNNING_STATES } from '@gust/contracts';
import { auditEvents, db, deployments, projects, services } from '@gust/db';
import { enqueueDeploy } from '@gust/db/queue';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { registryHost } from './engine-server';

type Running = (typeof RUNNING_STATES)[number];
const running = [...RUNNING_STATES] as Running[];

export class DeployError extends Error {}

export async function findService(project: string, service: string) {
  const [row] = await db
    .select({ service: services, project: projects })
    .from(services)
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(projects.slug, project), eq(services.name, service)));
  return row;
}

export async function startDeploy(input: {
  project: string;
  service: string;
  tag: string;
  rollbackOf?: string;
  /** Preview branch; omitted or null deploys to production. */
  branch?: string | null;
  author: string;
  actor: string;
  /** Set for deploys from GitHub Actions. */
  push?: { sha: string; message?: string; repository: string; runId: string };
}) {
  const row = await findService(input.project, input.service);
  if (!row?.project.engine) throw new DeployError('This service is not deployed through the engine');
  const svc = row.service;
  const branch = input.branch ?? null;
  // A pull request preview (pr-<n>) is not listed in previewBranches. Only a GitHub deploy
  // may name one, and that route has already checked the PR is open in this repository.
  const pullRequest = input.push && branch && PR_BRANCH.test(branch);
  if (branch && !pullRequest && !row.project.previewBranches.includes(branch))
    throw new DeployError(`${branch} is not a preview branch of ${input.project}. Add it in Settings → Branches.`);

  // A rollback redeploys the image tag stored with the target deployment. The
  // UI only knows the short commit, which is not the image tag.
  let tag = input.tag;
  if (input.rollbackOf) {
    const [target] = await db
      .select({ tag: deployments.tag, serviceId: deployments.serviceId, branch: deployments.branch })
      .from(deployments)
      .where(eq(deployments.id, input.rollbackOf));
    if (!target || target.serviceId !== svc.id) throw new DeployError('Rollback target not found');
    if (target.branch !== branch) throw new DeployError('A rollback stays on its own branch: production or the same preview');
    tag = target.tag;
  }
  if (svc.type !== 'app' || !svc.port) throw new DeployError('Only app services can be deployed');

  const [busy] = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(
      and(
        eq(deployments.serviceId, svc.id),
        branch ? eq(deployments.branch, branch) : isNull(deployments.branch),
        inArray(deployments.state, running),
      ),
    );
  if (busy) throw new DeployError(`A deploy is already running (${busy.id})`);

  const id = `dpl_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const imageRef = `${registryHost()}/${svc.image}:${tag}`;
  await db.insert(deployments).values({
    id,
    serviceId: svc.id,
    trigger: branch ? 'preview' : input.push ? 'push' : input.rollbackOf ? 'rollback' : 'manual',
    branch,
    tag,
    imageRef,
    message: input.push?.message || (input.rollbackOf ? `Roll back to ${tag}` : `Deploy ${tag}`),
    author: input.author,
    commitSha: input.push?.sha ?? null,
    rollbackOf: input.rollbackOf ?? null,
  });

  // A deploy to production brings a stopped service back, so the worker restores it from now on.
  if (!branch) await db.update(services).set({ stopped: false }).where(eq(services.id, svc.id));

  await db.insert(auditEvents).values({
    actor: input.actor,
    action: branch ? 'deploy.preview' : input.push ? 'deploy.push' : input.rollbackOf ? 'deploy.rollback' : 'deploy.start',
    target: `${input.project}/${input.service}${branch ? `@${branch}` : ''}`,
    detail: {
      deploymentId: id,
      tag,
      rollbackOf: input.rollbackOf ?? null,
      ...(input.push && { sha: input.push.sha, repository: input.push.repository, runId: input.push.runId }),
    },
  });

  await enqueueDeploy(id);
  return id;
}
