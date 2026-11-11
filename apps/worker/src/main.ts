// Gust worker: takes deploy jobs from the queue and keeps running services
// in line with the database.
import { type DatabaseJob, type DeployJob, type PreviewRemoveJob, QUEUES, type RegistryJob } from '@gust/db/queue';
import { PgBoss } from 'pg-boss';

import {
  backupAll,
  backupDatabase,
  dropDatabase,
  provisionDatabase,
  reconcileRedisUsers,
  recoverDatabases,
  restoreDatabase,
  rotateDatabase,
} from './databases';
import { runDeploy } from './deploy';
import { checkDomains } from './domains';
import { runPreviewRemove } from './preview-remove';
import { failCrashed, failInterrupted, reconcile } from './reconcile';
import { logRegistryError, reconcileRegistry } from './registry';
import { runRegistryJob } from './registry-job';

const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

const boss = new PgBoss(process.env.DATABASE_URL ?? 'postgres://gust:gust@127.0.0.1:5434/gust');
boss.on('error', (e) => log(`pg-boss error: ${e.message}`));
await boss.start();
await boss.createQueue(QUEUES.deploy, { retryLimit: 0, expireInSeconds: 15 * 60 });
await boss.createQueue(QUEUES.database, { retryLimit: 0, expireInSeconds: 5 * 60 });
await boss.createQueue(QUEUES.registry, { retryLimit: 0, expireInSeconds: 5 * 60 });
await boss.createQueue(QUEUES.previewRemove, { retryLimit: 2, retryDelay: 5, expireInSeconds: 10 * 60 });
await recoverDatabases(log);
// Not awaited: a Redis that is down must not hold the worker back; the interval below retries.
void reconcileRedisUsers(log).catch((e) => log(`redis reconcile failed: ${(e as Error).message}`));

await failInterrupted();

// Deploys of different services can run side by side; the web app makes
// sure a service never has two at once.
await boss.work<DeployJob>(QUEUES.deploy, { batchSize: 1, localConcurrency: 4, pollingIntervalSeconds: 0.5 }, async ([job]) => {
  if (!job) return;
  log(`deploy ${job.data.deploymentId}`);
  try {
    await runDeploy(job.data.deploymentId);
    log(`deploy ${job.data.deploymentId} done`);
  } catch (e) {
    // Anything runDeploy did not handle itself (database gone for a moment, a
    // bug): the deployment must still end, or its service stays "busy" forever.
    log(`deploy ${job.data.deploymentId} crashed: ${(e as Error).message}`);
    await failCrashed(job.data.deploymentId).catch((err) => log(`could not mark it failed: ${(err as Error).message}`));
  }
});

// Project databases: one statement at a time, see databases.ts.
await boss.work<DatabaseJob>(QUEUES.database, { batchSize: 1, localConcurrency: 2, pollingIntervalSeconds: 0.5 }, async ([job]) => {
  if (!job) return;
  const { databaseId, action, file } = job.data;
  const run = (): Promise<void> => {
    switch (action) {
      case 'drop':
        return dropDatabase(databaseId, log);
      case 'backup':
        return backupDatabase(databaseId, log);
      case 'rotate':
        return rotateDatabase(databaseId, log);
      case 'restore':
        return restoreDatabase(databaseId, file ?? '', log);
      default:
        return provisionDatabase(databaseId, log);
    }
  };
  await run().catch((e) => log(`database ${databaseId} ${action} crashed: ${(e as Error).message}`));
});

// Registry account jobs from the web and the CLI: one at a time, since each one writes Zot's files.
await boss.work<RegistryJob>(QUEUES.registry, { batchSize: 1, pollingIntervalSeconds: 1 }, async ([job]) => {
  if (!job) return;
  await runRegistryJob(job.data, log).catch((e) => log(`registry job crashed: ${(e as Error).message}`));
});

// Pull request previews removed when the PR closes or the project's limit evicts them.
await boss.work<PreviewRemoveJob>(QUEUES.previewRemove, { batchSize: 1, pollingIntervalSeconds: 1 }, async ([job]) => {
  if (!job) return;
  await runPreviewRemove(job.data, log); // a throw retries the job (retryLimit 2)
});

// Nightly dumps of every ready database, then retention. Cron and time zone are set in env.
await boss.createQueue(QUEUES.nightly, { retryLimit: 0, expireInSeconds: 60 * 60 });
await boss.schedule(QUEUES.nightly, process.env.BACKUP_CRON ?? '0 3 * * *', null, { tz: process.env.BACKUP_TZ ?? 'Europe/Prague' });
await boss.work(QUEUES.nightly, { batchSize: 1, pollingIntervalSeconds: 5 }, async () => {
  log('nightly database backup started');
  await backupAll(log).catch((e) => log(`nightly database backup crashed: ${(e as Error).message}`));
  log('nightly database backup finished');
});

// Redis ACL users come back after a Redis restart without this waiting for a worker restart.
setInterval(() => reconcileRedisUsers(log).catch((e) => log(`redis reconcile failed: ${(e as Error).message}`)), 60_000);

// Registry accounts: Zot loads the htpasswd file and push rules of every project, and reloads when they change.
const registryTick = () => reconcileRegistry(log).catch((e) => logRegistryError(log, e));
setTimeout(registryTick, 4000);
setInterval(registryTick, 60_000);

const every = Number(process.env.RECONCILE_EVERY_S ?? 20) * 1000;
const tick = () => reconcile(log).catch((e) => log(`reconcile failed: ${(e as Error).message}`));
setTimeout(tick, 3000);
setInterval(tick, every);

// Custom domains on their way to serving: DNS, then a deploy, then HTTPS.
const domainTick = () => checkDomains(log).catch((e) => log(`domain check failed: ${(e as Error).message}`));
setTimeout(domainTick, 5000);
setInterval(domainTick, Number(process.env.DOMAIN_CHECK_EVERY_S ?? 30) * 1000);

log('gust worker started');

const stop = async () => {
  log('stopping');
  await boss.stop({ graceful: true, timeout: 30_000 });
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
