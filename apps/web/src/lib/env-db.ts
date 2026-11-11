import 'server-only';

import type { EnvScope } from '@gust/contracts';
import { auditEvents, db, deployments, envVars } from '@gust/db';
import { decryptSecret, encryptSecret } from '@gust/db/secrets';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';

export type EnvRow = {
  id: string;
  key: string;
  scope: EnvScope;
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

type EnvInput = { key: string; value: string; scope: EnvScope; isSecret: boolean };

/** Upserts several variables in one transaction: all are saved or none. */
export async function setEnvMany(serviceId: string, target: string, actor: string, vars: EnvInput[]) {
  await db.transaction(async (tx) => {
    for (const v of vars) {
      const stored = v.isSecret ? encryptSecret(v.value) : v.value;
      await tx
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
      await tx.insert(auditEvents).values({ actor, action: 'env.set', target, detail: { key: v.key, scope: v.scope, secret: v.isSecret } });
    }
  });
}

export const setEnv = (serviceId: string, target: string, actor: string, v: EnvInput) => setEnvMany(serviceId, target, actor, [v]);

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
 * Changes one variable: its value (empty keeps a secret's old value), whether
 * it is secret and where it applies. Moving it to another scope replaces the
 * row, so the audit has a set for the new scope and a delete for the old one,
 * and both environments see the change.
 */
export async function updateEnv(
  serviceId: string,
  id: string,
  target: string,
  actor: string,
  v: { value?: string; scope: EnvScope; isSecret: boolean },
): Promise<'ok' | 'not-found' | 'taken' | 'value-needed'> {
  const [row] = await db
    .select()
    .from(envVars)
    .where(and(eq(envVars.id, id), eq(envVars.serviceId, serviceId)));
  if (!row) return 'not-found';
  if (v.scope !== row.scope) {
    const [clash] = await db
      .select({ id: envVars.id })
      .from(envVars)
      .where(and(eq(envVars.serviceId, serviceId), eq(envVars.key, row.key), eq(envVars.scope, v.scope), ne(envVars.id, id)));
    if (clash) return 'taken';
  }
  // A secret's old value never leaves the server: keep it as stored when no new one is given.
  let plain: string;
  if (v.value !== undefined && v.value !== '') plain = v.value;
  else if (row.isSecret) plain = decryptSecret(row.value);
  else if (v.value === '') return 'value-needed';
  else plain = row.value;
  const stored = v.isSecret ? encryptSecret(plain) : plain;
  await db.transaction(async (tx) => {
    await tx.update(envVars).set({ scope: v.scope, isSecret: v.isSecret, value: stored, createdAt: new Date() }).where(eq(envVars.id, id));
    await tx.insert(auditEvents).values({ actor, action: 'env.set', target, detail: { key: row.key, scope: v.scope, secret: v.isSecret } });
    if (v.scope !== row.scope)
      await tx.insert(auditEvents).values({ actor, action: 'env.delete', target, detail: { key: row.key, scope: row.scope } });
  });
  return 'ok';
}

/** An environment whose running deployment started before the env last changed for it. */
export type StaleEnv = { branch: string | null; liveTag: string; changedAt: string };

const reaches = (scope: string | undefined, branch: string | null) =>
  !scope || scope === 'all' || scope === (branch ? 'preview' : 'production');

/**
 * Which environments run with old variables: production, and each preview
 * branch, compared with the last env change that reaches it. Read from the
 * audit log, which also sees deletes.
 */
export async function envStaleness(serviceId: string, target: string): Promise<StaleEnv[]> {
  const live = await db
    .select({ tag: deployments.tag, branch: deployments.branch, createdAt: deployments.createdAt })
    .from(deployments)
    .where(and(eq(deployments.serviceId, serviceId), eq(deployments.state, 'live')))
    .orderBy(desc(deployments.createdAt));
  if (!live.length) return [];
  const changes = await db
    .select({ at: auditEvents.at, detail: auditEvents.detail })
    .from(auditEvents)
    .where(and(eq(auditEvents.target, target), inArray(auditEvents.action, ['env.set', 'env.delete'])))
    .orderBy(desc(auditEvents.at))
    .limit(200);
  const out: StaleEnv[] = [];
  const seen = new Set<string | null>();
  for (const l of live) {
    // Only the newest live deployment of each environment counts.
    if (seen.has(l.branch)) continue;
    seen.add(l.branch);
    const last = changes.find((c) => reaches((c.detail as { scope?: string } | null)?.scope, l.branch));
    if (last && last.at > l.createdAt) out.push({ branch: l.branch, liveTag: l.tag, changedAt: last.at.toISOString() });
  }
  return out;
}
