import 'server-only';

import { pickChild, readManifest, toMb } from './registry-logic';

// What zot holds, read with the read-only account the web already uses for pulls.
// Cached for five minutes so opening the page does not query every tag.

export type RegistryRepo = { name: string; tags: number; sizeMb: number | null };

const TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 8_000;
const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
].join(', ');

let cache: { at: number; repos: RegistryRepo[] } | null = null;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const user = process.env.REGISTRY_USERNAME;
  const pass = process.env.REGISTRY_PASSWORD;
  const out: Record<string, string> = { ...extra };
  if (user && pass) out.authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  return out;
}

async function getJson(path: string, accept?: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${process.env.REGISTRY_URL ?? 'http://127.0.0.1:5050'}${path}`, {
      cache: 'no-store',
      headers: headers(accept ? { accept } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Bytes of one tag's image, or null when the manifest cannot be read. */
async function tagBytes(repo: string, ref: string): Promise<number | null> {
  const body = await getJson(`/v2/${repo}/manifests/${encodeURIComponent(ref)}`, MANIFEST_ACCEPT);
  const m = readManifest(body);
  if (!m) return null;
  if (m.kind === 'image') return m.bytes;
  const digest = pickChild(m.children);
  if (!digest) return null;
  const child = readManifest(await getJson(`/v2/${repo}/manifests/${encodeURIComponent(digest)}`, MANIFEST_ACCEPT));
  return child?.kind === 'image' ? child.bytes : null;
}

/** Repositories in zot with their tag count and the size of their newest image, or null when zot does not answer. */
export async function registryRepos(): Promise<RegistryRepo[] | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.repos;
  const catalog = (await getJson('/v2/_catalog?n=1000')) as { repositories?: unknown } | null;
  if (!catalog || !Array.isArray(catalog.repositories)) return null;

  const repos: RegistryRepo[] = [];
  for (const name of catalog.repositories.filter((r): r is string => typeof r === 'string')) {
    const list = (await getJson(`/v2/${name}/tags/list`)) as { tags?: unknown } | null;
    const tags = Array.isArray(list?.tags) ? list.tags.filter((t): t is string => typeof t === 'string') : [];
    // Size is the newest tag's image. Tags of one repo share most layers, so summing them
    // would overstate the disk; the tag count is what the retention keeps.
    const newest = tags.find((t) => t === 'latest') ?? tags[0];
    const bytes = newest ? await tagBytes(name, newest) : null;
    repos.push({ name, tags: tags.length, sizeMb: bytes === null ? null : toMb(bytes) });
  }
  repos.sort((a, b) => a.name.localeCompare(b.name));
  cache = { at: Date.now(), repos };
  return repos;
}
