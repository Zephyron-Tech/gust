// Registry accounts: create, rotate and revoke a project's Zot account, and build the files
// Zot reads from them. Every change writes an audit row; the password itself is never stored.
import { eq, isNull } from 'drizzle-orm';

import { db } from './index';
import { accountName, generatePassword, hashPassword, renderHtpasswd, renderZotConfig, ZOT_BASE } from './registry-config';
import { auditEvents, projects, registryAccounts } from './schema';

/** Makes an account for a project and returns its password. The password is shown once, then only its hash is kept. */
export async function createAccount(projectId: string, slug: string, actor: string) {
  const password = generatePassword();
  const username = accountName(slug);
  await db.transaction(async (tx) => {
    await tx.insert(registryAccounts).values({
      id: `reg_${slug}`,
      projectId,
      username,
      passwordHash: hashPassword(password),
    });
    await tx.insert(auditEvents).values({
      actor,
      action: 'registry.account.create',
      target: `project:${slug}`,
      detail: { username },
    });
  });
  return { username, password };
}

/** A new password for an existing account. The old one stops working on the next sync. */
export async function rotateAccount(slug: string, actor: string) {
  const password = generatePassword();
  const now = new Date();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(registryAccounts)
      .set({ passwordHash: hashPassword(password), rotatedAt: now, revokedAt: null })
      .where(eq(registryAccounts.id, `reg_${slug}`))
      .returning({ username: registryAccounts.username });
    if (!row) throw new Error(`no registry account for ${slug}`);
    await tx
      .insert(auditEvents)
      .values({ actor, action: 'registry.account.rotate', target: `project:${slug}`, detail: { username: row.username } });
  });
  return { username: accountName(slug), password };
}

/** Stops the account from pushing. The sync removes it from htpasswd. */
export async function revokeAccount(slug: string, actor: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(registryAccounts)
      .set({ revokedAt: new Date() })
      .where(eq(registryAccounts.id, `reg_${slug}`))
      .returning({ username: registryAccounts.username });
    if (!row) throw new Error(`no registry account for ${slug}`);
    await tx
      .insert(auditEvents)
      .values({ actor, action: 'registry.account.revoke', target: `project:${slug}`, detail: { username: row.username } });
  });
}

/**
 * What Zot should load now: the active accounts and one push rule per project with an account.
 * `gustHash` is the read-only pull account.
 */
export async function buildRegistryFiles(opts: { gustHash: string; htpasswdPath: string }) {
  const rows = await db
    .select({ slug: projects.slug, username: registryAccounts.username, hash: registryAccounts.passwordHash })
    .from(registryAccounts)
    .innerJoin(projects, eq(projects.id, registryAccounts.projectId))
    .where(isNull(registryAccounts.revokedAt));

  const lines = [{ username: 'gust', hash: opts.gustHash }, ...rows.map((r) => ({ username: r.username, hash: r.hash }))];

  const config = renderZotConfig(
    ZOT_BASE,
    rows.map((r) => ({ slug: r.slug })),
    opts.htpasswdPath,
  );
  return { htpasswd: renderHtpasswd(lines), config: `${JSON.stringify(config, null, 2)}\n` };
}

/** Records whether the repository's secrets were written. The error text never holds a password. */
export async function recordSecretResult(slug: string, error: string | null) {
  await db
    .update(registryAccounts)
    .set(error ? { secretError: error.slice(0, 300) } : { secretSetAt: new Date(), secretError: null })
    .where(eq(registryAccounts.id, `reg_${slug}`));
}

/** What the UI shows: whether an account exists, is active, and whether its secret was written. */
export async function registryStatus(slug: string) {
  const [row] = await db
    .select({
      username: registryAccounts.username,
      rotatedAt: registryAccounts.rotatedAt,
      revokedAt: registryAccounts.revokedAt,
      secretSetAt: registryAccounts.secretSetAt,
      secretError: registryAccounts.secretError,
    })
    .from(registryAccounts)
    .where(eq(registryAccounts.id, `reg_${slug}`));
  return row ?? null;
}
