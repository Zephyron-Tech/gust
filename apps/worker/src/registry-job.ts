// A project's registry account: create or rotate it, sync Zot, then write the repository's
// GUST_REGISTRY_* secrets. The password exists only here, in memory, from creation to secret.
import { auditEvents, db, projects } from '@gust/db';
import type { RegistryJob } from '@gust/db/queue';
import { createAccount, recordSecretResult, revokeAccount, rotateAccount } from '@gust/db/registry';
import { eq } from 'drizzle-orm';

import { setActionsSecrets } from './github';
import { reconcileRegistry } from './registry';

export async function runRegistryJob(job: RegistryJob, log: (line: string) => void) {
  const [project] = await db.select({ id: projects.id, repo: projects.githubRepo }).from(projects).where(eq(projects.slug, job.slug));
  if (!project) return log(`registry ${job.action}: no project ${job.slug}`);

  if (job.action === 'revoke') {
    await revokeAccount(job.slug, job.actor).catch((e) => log(`registry revoke ${job.slug} failed: ${(e as Error).message}`));
    await reconcileRegistry(log).catch((e) => log(`registry sync after revoke failed: ${(e as Error).message}`));
    return;
  }

  let account: { username: string; password: string };
  try {
    account = job.action === 'create' ? await createAccount(project.id, job.slug, job.actor) : await rotateAccount(job.slug, job.actor);
  } catch (e) {
    return recordSecretResult(job.slug, `account: ${(e as Error).message}`);
  }

  // Zot first, so the new password works by the time the repository's secret holds it.
  await reconcileRegistry(log).catch((e) => log(`registry sync after ${job.action} failed: ${(e as Error).message}`));

  if (!project.repo) {
    await recordSecretResult(job.slug, 'The project has no GitHub repository, so the secret could not be set.');
    return;
  }
  try {
    await setActionsSecrets(project.repo, { GUST_REGISTRY_USERNAME: account.username, GUST_REGISTRY_PASSWORD: account.password });
    await recordSecretResult(job.slug, null);
    await db.insert(auditEvents).values({
      actor: job.actor,
      action: 'registry.secret.set',
      target: `project:${job.slug}`,
      detail: { repo: project.repo, secrets: ['GUST_REGISTRY_USERNAME', 'GUST_REGISTRY_PASSWORD'] },
    });
    log(`registry: secrets set on ${project.repo} for ${job.slug}`);
  } catch (e) {
    const message = (e as Error).message;
    await recordSecretResult(job.slug, `secret: ${message}`);
    log(`registry: secrets for ${job.slug} not set: ${message}`);
  }
}
