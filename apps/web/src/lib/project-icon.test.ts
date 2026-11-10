import { describe, expect, it } from 'vitest';

import { ICON_RECHECK_MS, iconCheckDue, isPublicIp, sniffIcon } from './project-icon';

const bytes = (...v: number[]) => new Uint8Array(v);
const text = (s: string) => new TextEncoder().encode(s);

describe('sniffIcon', () => {
  it('recognises raster icons by their signature', () => {
    expect(sniffIcon(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(sniffIcon(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0))).toBe('image/jpeg');
    expect(sniffIcon(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0))).toBe('image/gif');
    expect(sniffIcon(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
    expect(sniffIcon(bytes(0, 0, 1, 0, 1, 0, 16, 16))).toBe('image/x-icon');
  });

  it('accepts a plain svg and refuses one with script or foreign content', () => {
    expect(sniffIcon(text('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>'))).toBe('image/svg+xml');
    expect(sniffIcon(text('<svg><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffIcon(text('<svg><rect onload="x()"/></svg>'))).toBeNull();
    expect(sniffIcon(text('<svg><foreignObject></foreignObject></svg>'))).toBeNull();
    expect(sniffIcon(text('<svg><a href="javascript:alert(1)"><rect/></a></svg>'))).toBeNull();
  });

  it('refuses anything else, including html and short data', () => {
    expect(sniffIcon(text('<!doctype html><html></html>'))).toBeNull();
    expect(sniffIcon(bytes(1, 2, 3))).toBeNull();
  });
});

describe('isPublicIp', () => {
  it('allows public addresses', () => {
    expect(isPublicIp('93.184.216.34')).toBe(true);
    expect(isPublicIp('2606:4700:4700::1111')).toBe(true);
    expect(isPublicIp('::ffff:93.184.216.34')).toBe(true);
  });

  it('refuses private, loopback, link-local and reserved addresses', () => {
    for (const ip of [
      '10.0.0.5',
      '127.0.0.1',
      '0.0.0.0',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.1',
      '192.168.1.1',
      '100.64.0.1',
      '224.0.0.1',
      '198.18.0.1',
      '::1',
      '::',
      'fc00::1',
      'fd12::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      'ff02::1',
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
    expect(isPublicIp('172.32.0.1')).toBe(true);
    expect(isPublicIp('not an ip')).toBe(false);
  });
});

describe('iconCheckDue', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  it('asks a site never checked, or checked a day ago or longer', () => {
    expect(iconCheckDue(null, now)).toBe(true);
    expect(iconCheckDue(new Date(now - ICON_RECHECK_MS - 1), now)).toBe(true);
    expect(iconCheckDue(new Date(now - 60_000), now)).toBe(false);
  });
});
