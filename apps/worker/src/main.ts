// Gust worker: takes deploy jobs from the queue and keeps running services
// in line with the database.
import { type DeployJob, QUEUES } from '@gust/db/queue';
import { PgBoss } from 'pg-boss';

import { runDeploy } from './deploy';
import { checkDomains } from './domains';
import { failCrashed, failInterrupted, reconcile } from './reconcile';

const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

const boss = new PgBoss(process.env.DATABASE_URL ?? 'postgres://gust:gust@127.0.0.1:5434/gust');
boss.on('error', (e) => log(`pg-boss error: ${e.message}`));
await boss.start();
await boss.createQueue(QUEUES.deploy, { retryLimit: 0, expireInSeconds: 15 * 60 });

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
