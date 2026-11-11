import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { MAX_PR_PREVIEWS, pickEviction, signatureValid } from './github-webhook';

const secret = 'test-secret';
const body = '{"action":"opened"}';
const sign = (text: string, key = secret) => `sha256=${createHmac('sha256', key).update(text).digest('hex')}`;

describe('signatureValid', () => {
  it('accepts the signature GitHub makes over the raw body', () => {
    expect(signatureValid(secret, body, sign(body))).toBe(true);
  });

  it('refuses a body that changed, a wrong secret, a missing or malformed header', () => {
    expect(signatureValid(secret, `${body} `, sign(body))).toBe(false);
    expect(signatureValid(secret, body, sign(body, 'other'))).toBe(false);
    expect(signatureValid(secret, body, null)).toBe(false);
    expect(signatureValid(secret, body, sign(body).replace('sha256=', 'sha1='))).toBe(false);
    expect(signatureValid(secret, body, 'sha256=short')).toBe(false);
  });
});

describe('pickEviction', () => {
  const at = (n: number, day: number) => ({ number: n, updatedAt: new Date(`2026-11-${String(day).padStart(2, '0')}T10:00:00Z`) });

  it('has room below the limit', () => {
    const running = Array.from({ length: MAX_PR_PREVIEWS - 1 }, (_, i) => at(i + 1, i + 1));
    expect(pickEviction(running)).toBeNull();
  });

  it('removes the least recently changed preview once the limit is reached', () => {
    const running = Array.from({ length: MAX_PR_PREVIEWS }, (_, i) => at(i + 1, 20 - i));
    // PR 10 changed on day 11 (the oldest), so it goes.
    expect(pickEviction(running)).toBe(10);
  });

  it('takes the limit as an argument', () => {
    expect(MAX_PR_PREVIEWS).toBe(10);
    expect(pickEviction([at(1, 1)], 1)).toBe(1);
  });
});
