import 'server-only';

import { auditEvents, db, deployments, envVars } from '@gust/db';
import { decryptSecret, encryptSecret } from '@gust/db/secrets';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

export type EnvRow = {
  id: string;
  key: string;
  scope: 'production' | 'preview';
  isSecret: boolean;
  value: string | null;
  updatedAt: string;
};

/** Env vars of a service. Secret values are never sent; `value` is null for them. */
export async function listEnv(serviceId: string): Promise<EnvRow[]> {
  const rows = await db.select().from(envVars).where(eq(envVars.serviceId, serviceId)).orderBy(asc(envVars.key));
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    scope: r.scope,
    isSecret: r.isSecret,
    value: r.isSecret ? null : r.value,
    updatedAt: r.createdAt.toISOString(),
  }));
}

export async function setEnv(
  serviceId: string,
  target: string,
  actor: string,
  v: { key: string; value: string; scope: 'production' | 'preview'; isSecret: boolean },
) {
  const stored = v.isSecret ? encryptSecret(v.value) : v.value;
  await db
    .insert(envVars)
    .values({
      id: `env_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      serviceId,
      key: v.key,
      scope: v.scope,
      isSecret: v.isSecret,
      value: stored,
    })
    .onConflictDoUpdate({
      target: [envVars.serviceId, envVars.key, envVars.scope],
      set: { value: stored, isSecret: v.isSecret, createdAt: new Date() },
    });
  // The audit names the key, never the value.
  await db.insert(auditEvents).values({ actor, action: 'env.set', target, detail: { key: v.key, scope: v.scope, secret: v.isSecret } });
}

export async function deleteEnv(serviceId: string, id: string, target: string, actor: string) {
  const [row] = await db
    .delete(envVars)
    .where(and(eq(envVars.id, id), eq(envVars.serviceId, serviceId)))
    .returning();
  if (row) await db.insert(auditEvents).values({ actor, action: 'env.delete', target, detail: { key: row.key, scope: row.scope } });
  return Boolean(row);
}

export async function revealEnv(serviceId: string, id: string, target: string, actor: string) {
  const [row] = await db
    .select()
    .from(envVars)
    .where(and(eq(envVars.id, id), eq(envVars.serviceId, serviceId)));
  if (!row) return null;
  await db.insert(auditEvents).values({ actor, action: 'env.reveal', target, detail: { key: row.key, scope: row.scope } });
  return row.isSecret ? decryptSecret(row.value) : row.value;
}

/**
 * Whether the env changed after the live deployment started, so the running
 * app does not have it yet. Read from the audit log, which also sees deletes.
 */
export async function envStaleness(serviceId: string, target: string) {
  const [live] = await db
    .select({ tag: deployments.tag, createdAt: deployments.createdAt })
    .from(deployments)
    .where(and(eq(deployments.serviceId, serviceId), eq(deployments.state, 'live')))
    .orderBy(desc(deployments.createdAt))
    .limit(1);
  const [change] = await db
    .select({ at: auditEvents.at })
    .from(auditEvents)
    .where(and(eq(auditEvents.target, target), inArray(auditEvents.action, ['env.set', 'env.delete'])))
    .orderBy(desc(auditEvents.at))
    .limit(1);
  const stale = Boolean(live && change && change.at > live.createdAt);
  return { stale, liveTag: live?.tag ?? null, changedAt: stale ? change?.at.toISOString() : null };
}
