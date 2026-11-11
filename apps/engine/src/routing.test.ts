import { describe, expect, it } from 'vitest';

import { wildcardFor } from './routing';

const zones = ['zephyron.tech', 'gust.zephyron.tech'];

describe('wildcardFor', () => {
  it('maps a one-label host under a zone to that zone wildcard', () => {
    expect(wildcardFor('demo.zephyron.tech', zones)).toBe('*.zephyron.tech');
    expect(wildcardFor('dev-demo.gust.zephyron.tech', zones)).toBe('*.gust.zephyron.tech');
  });

  it('leaves hosts with more labels, the apex, and other domains on HTTP-01', () => {
    expect(wildcardFor('a.b.gust.zephyron.tech', zones)).toBeNull();
    expect(wildcardFor('zephyron.tech', zones)).toBeNull();
    expect(wildcardFor('example.cz', zones)).toBeNull();
  });

  it('treats gust.zephyron.tech as one label under zephyron.tech', () => {
    expect(wildcardFor('gust.zephyron.tech', zones)).toBe('*.zephyron.tech');
  });

  it('returns null when no zones are configured', () => {
    expect(wildcardFor('demo.zephyron.tech', [])).toBeNull();
  });

  it('does not match a suffix that is only part of a label', () => {
    expect(wildcardFor('evilzephyron.tech', zones)).toBeNull();
  });
});
