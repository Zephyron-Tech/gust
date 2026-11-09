import 'server-only';

import { randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';

// Cached per process so a page load does not run a DNS lookup every time.
const TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 3_000;
let cache: { domain: string; at: number; resolved: string[] | null } | null = null;

/**
 * IPv4 addresses a random name under `domain` resolves to, or null when it does
 * not resolve. A random label means a specific record cannot answer for the
 * wildcard; only the wildcard does.
 */
export async function wildcardAddresses(domain: string): Promise<string[] | null> {
  if (cache && cache.domain === domain && Date.now() - cache.at < TTL_MS) return cache.resolved;
  const probe = `probe-${randomBytes(4).toString('hex')}.${domain}`;
  let resolved: string[] | null;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
    });
    try {
      const found = await Promise.race([dns.lookup(probe, { family: 4, all: true }), timeout]);
      resolved = found.map((f) => f.address);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    resolved = null;
  }
  cache = { domain, at: Date.now(), resolved };
  return resolved;
}
