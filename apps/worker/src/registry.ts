// Keeps Zot's login file and push rules in line with the registry accounts in the database.
// Writes into the shared registry-auth volume; when the content changes, the engine restarts Zot
// (only the engine talks to Docker).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildRegistryFiles } from '@gust/db/registry';
import { hashPassword } from '@gust/db/registry-config';

import { engineFetch } from './engine';

const dir = () => process.env.REGISTRY_AUTH_DIR ?? '/registry-auth';
// What Zot reads at its own path, inside its container.
const HTPASSWD_IN_ZOT = '/etc/zot-auth/htpasswd';

// A bcrypt hash changes every time it is made, so each password is hashed once per worker and
// reused. Otherwise every sync would rewrite htpasswd and restart Zot.
const hashes = new Map<string, string>();
function stableHash(password: string) {
  let h = hashes.get(password);
  if (!h) {
    h = hashPassword(password);
    hashes.set(password, h);
  }
  return h;
}

async function readOr(path: string) {
  return readFile(path, 'utf8').catch(() => null);
}

/** Writes the files and returns true when they changed. */
async function writeIfChanged(name: string, content: string) {
  const path = join(dir(), name);
  if ((await readOr(path)) === content) return false;
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, { mode: 0o644 });
  await rename(tmp, path);
  return true;
}

let lastError = '';

export async function reconcileRegistry(log: (msg: string) => void) {
  const gustPassword = process.env.REGISTRY_PULL_PASSWORD;
  if (!gustPassword) return; // Not configured yet; nothing to load.

  await mkdir(dir(), { recursive: true });
  const files = await buildRegistryFiles({
    gustHash: stableHash(gustPassword),
    htpasswdPath: HTPASSWD_IN_ZOT,
  });

  const htpasswdChanged = await writeIfChanged('htpasswd', files.htpasswd);
  const configChanged = await writeIfChanged('config.json', files.config);
  if (!htpasswdChanged && !configChanged) return;

  const res = await engineFetch('/v1/registry/reload', { method: 'POST' }).catch((e: Error) => {
    throw new Error(`engine reload failed: ${e.message}`);
  });
  if (!res.ok) throw new Error(`engine reload answered ${res.status}`);
  log('registry: accounts changed, Zot reloaded');
}

/** Logs a failure once, not every minute. */
export function logRegistryError(log: (msg: string) => void, e: unknown) {
  const msg = `registry sync failed: ${(e as Error).message}`;
  if (msg !== lastError) log(msg);
  lastError = msg;
}
