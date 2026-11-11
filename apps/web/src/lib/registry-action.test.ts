import { describe, expect, it } from 'vitest';

import { type AccountView, isJobDone, outcome } from './registry-action';

const base: AccountView = {
  username: 'ci-demo',
  rotatedAt: null,
  revokedAt: null,
  secretSetAt: '2026-11-11T10:00:00.000Z',
  secretError: null,
  secretCheckedAt: '2026-11-11T10:00:00.000Z',
};

describe('isJobDone', () => {
  it('is not done while the status is unchanged', () => {
    expect(isJobDone(base, base, 'rotate')).toBe(false);
  });

  it('rotate and create are done when the secret result is recorded again', () => {
    const after = { ...base, rotatedAt: '2026-11-11T10:05:00.000Z', secretCheckedAt: '2026-11-11T10:05:00.000Z' };
    expect(isJobDone(base, after, 'rotate')).toBe(true);
    expect(isJobDone(null, { ...base, secretCheckedAt: '2026-11-11T10:05:00.000Z' }, 'create')).toBe(true);
  });

  it('a repeated error with a new check time is done, even though the text is the same', () => {
    const failed = { ...base, secretError: 'secret: 403', secretCheckedAt: '2026-11-11T10:00:00.000Z' };
    const again = { ...failed, secretCheckedAt: '2026-11-11T10:05:00.000Z' };
    expect(isJobDone(failed, again, 'rotate')).toBe(true);
  });

  it('revoke is done when revokedAt is set', () => {
    expect(isJobDone(base, { ...base, revokedAt: '2026-11-11T10:06:00.000Z' }, 'revoke')).toBe(true);
    expect(isJobDone(base, base, 'revoke')).toBe(false);
  });

  it('is never done without an account', () => {
    expect(isJobDone(null, null, 'create')).toBe(false);
  });
});

describe('outcome', () => {
  it('says what succeeded, per action', () => {
    expect(outcome(base, 'rotate')).toEqual({ tone: 'ok', text: 'Password rotated. The GitHub secrets are set.' });
    expect(outcome(base, 'rotate', true).text).toBe('Account reactivated. The GitHub secrets are set.');
    expect(outcome(base, 'create').text).toBe('Account created. The GitHub secrets are set.');
    expect(outcome(null, 'revoke').tone).toBe('ok');
  });

  it('shows the error text when the secrets were not set', () => {
    const failed = { ...base, secretError: 'secret: 403' };
    expect(outcome(failed, 'rotate')).toEqual({ tone: 'err', text: 'The GitHub secrets were not set: secret: 403' });
  });
});
