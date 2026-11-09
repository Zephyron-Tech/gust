import { describe, expect, it } from 'vitest';

import { dnsVerdict } from './domains';

describe('dnsVerdict', () => {
  it('waits while there is no A record', () => {
    expect(dnsVerdict(null, '203.0.113.24').ok).toBe(false);
    expect(dnsVerdict([], '203.0.113.24').ok).toBe(false);
  });

  it('passes when one of the addresses is this server', () => {
    expect(dnsVerdict(['198.51.100.1', '203.0.113.24'], '203.0.113.24')).toEqual({ ok: true });
  });

  it('names where the domain points instead', () => {
    const v = dnsVerdict(['198.51.100.1'], '203.0.113.24');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('198.51.100.1');
  });
});
