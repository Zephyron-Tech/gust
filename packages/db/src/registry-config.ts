// Zot's login and push rules, rendered from the database. Pure functions: no I/O, no Docker.
//
// Every project pushes with its own account, `ci-<slug>`, and may write only under `<slug>/`.
// `gust` is the read-only account the engine and web pull with.
import { randomInt } from 'node:crypto';

import bcrypt from 'bcryptjs';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** A random password, 32 characters, from the OS-seeded CSPRNG. Shown once, stored only as a hash. */
export function generatePassword(length = 32): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export const hashPassword = (password: string) => bcrypt.hashSync(password, 10);

export const accountName = (slug: string) => `ci-${slug}`;

export interface HtpasswdLine {
  username: string;
  hash: string;
}

/** One `user:hash` line per account, the format Zot reads from its htpasswd file. */
export function renderHtpasswd(lines: HtpasswdLine[]): string {
  return `${lines.map((l) => `${l.username}:${l.hash}`).join('\n')}\n`;
}

export interface ZotBase {
  storage: Record<string, unknown>;
  http: { address: string; port: string; realm: string; auth: { failDelay: number }; accessControl?: unknown };
  log: Record<string, unknown>;
}

export interface RegistryProject {
  slug: string;
}

/**
 * The full Zot config: the storage and log settings from `base`, the htpasswd path, and one
 * access rule per project.
 */
export function renderZotConfig(base: ZotBase, projects: RegistryProject[], htpasswdPath: string) {
  const repositories: Record<string, { policies: unknown[]; defaultPolicy: string[] }> = {};
  for (const p of projects) {
    // Zot applies only the rule that matches the repository, so the pull account is listed here too.
    repositories[`${p.slug}/**`] = {
      policies: [
        { users: [accountName(p.slug)], actions: ['read', 'create', 'update', 'delete'] },
        { users: ['gust'], actions: ['read'] },
      ],
      defaultPolicy: [],
    };
  }
  // `gust` reads everything; pushes stay with the project accounts above.
  repositories['**'] = { policies: [{ users: ['gust'], actions: ['read'] }], defaultPolicy: [] };
  const http = {
    address: base.http.address,
    port: base.http.port,
    realm: base.http.realm,
    auth: { htpasswd: { path: htpasswdPath }, failDelay: base.http.auth.failDelay },
    accessControl: { repositories },
  };
  return { distSpecVersion: '1.1.1', storage: base.storage, http, log: base.log };
}

/** The settings Zot runs with in production. Storage keeps the 20 newest pushed tags per repository. */
export const ZOT_BASE: ZotBase = {
  storage: {
    rootDirectory: '/var/lib/registry',
    gc: true,
    gcDelay: '1h',
    gcInterval: '24h',
    retention: {
      delay: '24h',
      policies: [{ repositories: ['**'], deleteReferrers: true, keepTags: [{ mostRecentlyPushedCount: 20 }] }],
    },
  },
  http: { address: '0.0.0.0', port: '5000', realm: 'gust', auth: { failDelay: 1 } },
  log: { level: 'info' },
};
