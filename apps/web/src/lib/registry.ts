import 'server-only';

import { ADMIN_ACCOUNT } from '@gust/db/registry-config';

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

export type RegistryTag = { tag: string; digest: string | null; sizeMb: number | null; created: string | null };

const baseUrl = () => process.env.REGISTRY_URL ?? 'http://127.0.0.1:5050';

function headers(
  extra: Record<string, string> = {},
  user = process.env.REGISTRY_USERNAME,
  pass = process.env.REGISTRY_PASSWORD,
): Record<string, string> {
  const out: Record<string, string> = { ...extra };
  if (user && pass) out.authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  return out;
}

async function getJson(path: string, accept?: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
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

/** A manifest with the digest zot reports for it, or null when it cannot be read. */
async function manifestWithDigest(repo: string, ref: string) {
  try {
    const res = await fetch(`${baseUrl()}/v2/${repo}/manifests/${encodeURIComponent(ref)}`, {
      cache: 'no-store',
      headers: headers({ accept: MANIFEST_ACCEPT }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return { digest: res.headers.get('docker-content-digest'), body: (await res.json()) as unknown };
  } catch {
    return null;
  }
}

/** Size and build time of a tag's image; an index is followed to its linux/amd64 child. */
async function imageInfo(repo: string, body: unknown) {
  const m = readManifest(body);
  if (!m) return { sizeMb: null, created: null };
  let image = body;
  let bytes: number | null = m.kind === 'image' ? m.bytes : null;
  if (m.kind === 'index') {
    const digest = pickChild(m.children);
    const child = digest ? await getJson(`/v2/${repo}/manifests/${encodeURIComponent(digest)}`, MANIFEST_ACCEPT) : null;
    const childManifest = readManifest(child);
    if (childManifest?.kind === 'image') {
      image = child;
      bytes = childManifest.bytes;
    }
  }
  const configDigest = (image as { config?: { digest?: unknown } } | null)?.config?.digest;
  const config =
    typeof configDigest === 'string' ? ((await getJson(`/v2/${repo}/blobs/${configDigest}`)) as { created?: unknown } | null) : null;
  return {
    sizeMb: bytes === null ? null : toMb(bytes),
    created: typeof config?.created === 'string' ? config.created : null,
  };
}

/** The tags of one repository, newest build first, or null when zot does not know the repository. */
export async function registryTags(repo: string): Promise<RegistryTag[] | null> {
  const list = (await getJson(`/v2/${repo}/tags/list`)) as { tags?: unknown } | null;
  if (!list || !Array.isArray(list.tags)) return null;
  const tags = list.tags.filter((t): t is string => typeof t === 'string');
  const rows = await Promise.all(
    tags.map(async (tag): Promise<RegistryTag> => {
      const top = await manifestWithDigest(repo, tag);
      if (!top) return { tag, digest: null, sizeMb: null, created: null };
      return { tag, digest: top.digest, ...(await imageInfo(repo, top.body)) };
    }),
  );
  return rows.sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''));
}

/** Deletes a manifest by digest with the admin account. Every tag on that digest goes with it. */
export async function deleteManifest(repo: string, digest: string): Promise<'deleted' | 'not-found' | 'failed'> {
  const pass = process.env.REGISTRY_ADMIN_PASSWORD;
  if (!pass) return 'failed';
  try {
    const res = await fetch(`${baseUrl()}/v2/${repo}/manifests/${digest}`, {
      method: 'DELETE',
      cache: 'no-store',
      headers: headers({}, ADMIN_ACCOUNT, pass),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return 'not-found';
    if (!res.ok) return 'failed';
  } catch {
    return 'failed';
  }
  // The repository list shows tag counts; drop it so the next visit shows the deletion.
  cache = null;
  return 'deleted';
}
