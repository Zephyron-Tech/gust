// The job queue between the web app and the worker, on pg-boss in the same
// Postgres. The web app only sends; the worker does the work.
import { PgBoss } from 'pg-boss';

export const QUEUES = { deploy: 'deploy', database: 'database' } as const;
export type DeployJob = { deploymentId: string };
export type DatabaseJob = { databaseId: string };

const url = () => process.env.DATABASE_URL ?? 'postgres://gust:gust@127.0.0.1:5434/gust';

const g = globalThis as unknown as { gustBoss?: Promise<PgBoss> };

/** A pg-boss client for sending jobs only: no maintenance or schedules. */
export function sender(): Promise<PgBoss> {
  g.gustBoss ??= (async () => {
    const boss = new PgBoss({ connectionString: url(), supervise: false, schedule: false });
    boss.on('error', (e) => console.error('pg-boss', e));
    await boss.start();
    await boss.createQueue(QUEUES.deploy, { retryLimit: 0, expireInSeconds: 15 * 60 });
    return boss;
  })();
  return g.gustBoss;
}

export async function enqueueDeploy(deploymentId: string) {
  const boss = await sender();
  return boss.send(QUEUES.deploy, { deploymentId } satisfies DeployJob);
}

export async function enqueueDatabase(databaseId: string) {
  const boss = await sender();
  await boss.createQueue(QUEUES.database, { retryLimit: 0, expireInSeconds: 5 * 60 });
  return boss.send(QUEUES.database, { databaseId } satisfies DatabaseJob);
}
