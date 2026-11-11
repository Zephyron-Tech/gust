import { describe, expect, it } from 'vitest';

import { cell } from './project-db';

describe('cell', () => {
  it('shows null as null, bytes as a size, dates as ISO and objects as JSON', () => {
    expect(cell(null)).toBeNull();
    expect(cell(undefined)).toBeNull();
    expect(cell(Buffer.from('abc'))).toBe('<3 bytes>');
    expect(cell(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z');
    expect(cell({ a: 1 })).toBe('{"a":1}');
    expect(cell(42)).toBe('42');
  });

  it('cuts very long text', () => {
    const out = cell('x'.repeat(5000)) ?? '';
    expect(out.length).toBe(2001);
    expect(out.endsWith('…')).toBe(true);
  });
});
