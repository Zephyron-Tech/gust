// Reads what the registry says about one image manifest. Pure, so it can be tested.
// Gust images are one platform, but buildx may wrap them in an index (with
// attestations), so an index is followed to its linux/amd64 child.

export type ManifestSize = { kind: 'image'; bytes: number };
export type ManifestIndex = { kind: 'index'; children: { digest: string; os?: string; arch?: string }[] };

/** The size of an image manifest (config plus layers), or the children of an index, or null. */
export function readManifest(body: unknown): ManifestSize | ManifestIndex | null {
  if (!body || typeof body !== 'object') return null;
  const v = body as { manifests?: unknown; config?: { size?: unknown }; layers?: unknown };
  if (Array.isArray(v.manifests)) {
    const children = v.manifests
      .map((m) => {
        const c = m as { digest?: unknown; platform?: { os?: unknown; architecture?: unknown } };
        if (typeof c.digest !== 'string') return null;
        return {
          digest: c.digest,
          os: typeof c.platform?.os === 'string' ? c.platform.os : undefined,
          arch: typeof c.platform?.architecture === 'string' ? c.platform.architecture : undefined,
        };
      })
      .filter((c): c is { digest: string; os: string | undefined; arch: string | undefined } => c !== null);
    return { kind: 'index', children };
  }
  if (!Array.isArray(v.layers)) return null;
  const sizes = [v.config?.size, ...v.layers.map((l) => (l as { size?: unknown }).size)];
  if (!sizes.every((s) => typeof s === 'number' && Number.isFinite(s))) return null;
  return { kind: 'image', bytes: (sizes as number[]).reduce((a, b) => a + b, 0) };
}

/** The child to measure in an index: linux/amd64 when listed, otherwise the first. */
export function pickChild(children: ManifestIndex['children']): string | null {
  const amd64 = children.find((c) => c.os === 'linux' && c.arch === 'amd64');
  return (amd64 ?? children[0])?.digest ?? null;
}

/** Bytes to decimal MB, rounded, for the table. */
export function toMb(bytes: number): number {
  return Math.round(bytes / 1e5) / 10;
}
