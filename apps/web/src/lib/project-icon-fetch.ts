import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
// Takes a project's icon from its live site. The host comes from the project
// row, but the site can redirect anywhere, so every hop is checked: https
// only, no credentials, and only addresses on the public internet.
import { auditEvents, db, projects } from '@gust/db';
import { eq } from 'drizzle-orm';

import { ICON_MAX_BYTES, isPublicIp, sniffIcon } from './project-icon';

const MAX_HOPS = 3;
const PAGE_MAX_BYTES = 512 * 1024;

async function safeGet(start: string, accept: string, maxBytes: number, timeoutMs: number) {
  let url: URL;
  try {
    url = new URL(start);
  } catch {
    return null;
  }
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true }).catch(() => []);
    if (addresses.length === 0 || !addresses.every((a) => isPublicIp(a.address))) return null;

    const res = await fetch(url, {
      redirect: 'manual',
      headers: { accept, 'user-agent': 'Gust icon fetch' },
      signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      await res.body?.cancel();
      if (!next) return null;
      url = new URL(next, url);
      continue;
    }
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done || !value) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      body.set(c, at);
      at += c.byteLength;
    }
    return { url, body, contentType: res.headers.get('content-type') ?? '' };
  }
  return null;
}

/** Icon candidates named by the page's link tags, favicon first, then the conventional /favicon.ico. */
function candidates(html: string, base: URL): string[] {
  const ranked: { href: string; rank: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || (!rel.split(/\s+/).includes('icon') && !rel.includes('apple-touch-icon'))) continue;
    try {
      ranked.push({ href: new URL(href, base).toString(), rank: rel.includes('apple-touch-icon') ? 1 : 0 });
    } catch {
      // A malformed href is skipped.
    }
  }
  ranked.sort((a, b) => a.rank - b.rank);
  const list = [...new Set(ranked.map((r) => r.href))];
  list.push(new URL('/favicon.ico', base).toString());
  return list.slice(0, 4);
}

/** The icon the project's site serves, when it serves one we accept. */
export async function fetchSiteIcon(domain: string): Promise<{ type: string; bytes: Uint8Array } | null> {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) return null;
  const page = await safeGet(`https://${domain}/`, 'text/html', PAGE_MAX_BYTES, 5000);
  const base = page?.url ?? new URL(`https://${domain}/`);
  const html = page && /html/i.test(page.contentType) ? new TextDecoder().decode(page.body) : '';
  for (const href of candidates(html, base)) {
    const got = await safeGet(href, 'image/*', ICON_MAX_BYTES, 5000);
    if (!got) continue;
    const type = sniffIcon(got.body);
    if (type) return { type, bytes: got.body };
  }
  return null;
}

const inflight = new Map<string, Promise<boolean>>();

/**
 * Asks the project's site for its icon and stores it. Only one ask per project
 * runs at a time. `force` is the admin's "Take from site": it replaces an
 * uploaded icon and clears a removed one. Otherwise a manual or removed icon
 * is left alone. Resolves true when an icon was stored.
 */
export function refreshIconFromSite(slug: string, force = false): Promise<boolean> {
  const running = inflight.get(slug);
  if (running) return running;
  const job = (async () => {
    const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
    if (!project) return false;
    const now = new Date();
    const got = await fetchSiteIcon(project.domain).catch(() => null);
    if (!got) {
      await db.update(projects).set({ iconCheckedAt: now }).where(eq(projects.id, project.id));
      return false;
    }
    if (!force && project.iconSource !== null && project.iconSource !== 'auto') {
      await db.update(projects).set({ iconCheckedAt: now }).where(eq(projects.id, project.id));
      return false;
    }
    await db
      .update(projects)
      .set({
        iconType: got.type,
        iconData: Buffer.from(got.bytes).toString('base64'),
        iconSource: 'auto',
        iconUpdatedAt: now,
        iconCheckedAt: now,
      })
      .where(eq(projects.id, project.id));
    await db
      .insert(auditEvents)
      .values({ actor: 'gust', action: 'project.icon.fetch', target: slug, detail: { type: got.type, bytes: got.bytes.byteLength } });
    return true;
  })().finally(() => inflight.delete(slug));
  inflight.set(slug, job);
  return job;
}
