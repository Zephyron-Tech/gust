import { beforeAll, describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from './secrets';

beforeAll(() => {
  process.env.GUST_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('secrets', () => {
  it('round-trips a value', () => {
    expect(decryptSecret(encryptSecret('postgres://app:p4ss@db/app'))).toBe('postgres://app:p4ss@db/app');
  });

  it('uses a fresh IV every time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('refuses a tampered value', () => {
    const parts = encryptSecret('value').split('.');
    parts[2] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('refuses the wrong key', () => {
    const s = encryptSecret('value');
    process.env.GUST_MASTER_KEY = Buffer.alloc(32, 9).toString('base64');
    expect(() => decryptSecret(s)).toThrow();
    process.env.GUST_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
  });
});
