import { describe, expect, it } from 'vitest';

import { pickChild, readManifest, toMb } from './registry-logic';

describe('registry manifests', () => {
  it('adds the config and every layer of an image manifest', () => {
    const body = { config: { size: 1000 }, layers: [{ size: 2000 }, { size: 3000 }] };
    expect(readManifest(body)).toEqual({ kind: 'image', bytes: 6000 });
  });

  it('reads an index and picks linux/amd64 from it', () => {
    const body = {
      manifests: [
        { digest: 'sha256:att', platform: { os: 'unknown', architecture: 'unknown' } },
        { digest: 'sha256:amd', platform: { os: 'linux', architecture: 'amd64' } },
      ],
    };
    const idx = readManifest(body);
    expect(idx?.kind).toBe('index');
    if (idx?.kind === 'index') expect(pickChild(idx.children)).toBe('sha256:amd');
  });

  it('falls back to the first child when no amd64 is listed', () => {
    expect(pickChild([{ digest: 'sha256:x', os: 'linux', arch: 'arm64' }])).toBe('sha256:x');
    expect(pickChild([])).toBeNull();
  });

  it('rejects anything that is not a manifest', () => {
    expect(readManifest(null)).toBeNull();
    expect(readManifest({ config: { size: 'big' }, layers: [] })).toBeNull();
    expect(readManifest({ errors: [] })).toBeNull();
  });

  it('converts bytes to decimal MB with one decimal', () => {
    expect(toMb(1_940_000_000)).toBe(1940);
    expect(toMb(612_300_000)).toBe(612.3);
  });
});
