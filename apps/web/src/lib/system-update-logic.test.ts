import { describe, expect, it } from 'vitest';

import { decide, parseStatus, tailLog } from './system-update-logic';

describe('parseStatus', () => {
  it('reports unknown when there is no status file', () => {
    expect(parseStatus(null)).toMatchObject({ state: 'unknown', available: false, checkedAt: null });
  });

  it('reads a status written by the host', () => {
    const raw =
      '{"state":"idle","action":"check","current":"sha256:a","latest":"sha256:b","available":true,"checkedAt":"2026-11-09T10:00:00Z"}';
    expect(parseStatus(raw)).toEqual({
      state: 'idle',
      action: 'check',
      current: 'sha256:a',
      latest: 'sha256:b',
      available: true,
      checkedAt: '2026-11-09T10:00:00Z',
    });
  });

  it('treats broken JSON and unknown states as unknown', () => {
    expect(parseStatus('{not json').state).toBe('unknown');
    expect(parseStatus('{"state":"exploded"}').state).toBe('unknown');
  });

  it('only accepts available === true', () => {
    expect(parseStatus('{"state":"idle","available":"yes"}').available).toBe(false);
  });
});

describe('decide', () => {
  it('refuses an install while one runs', () => {
    expect(decide('install', { state: 'running', available: true })).toMatchObject({ ok: false, status: 409 });
  });

  it('refuses an install when no newer version exists', () => {
    expect(decide('install', { state: 'idle', available: false })).toMatchObject({ ok: false, status: 409 });
    expect(decide('install', { state: 'unknown', available: false })).toMatchObject({ ok: false, status: 409 });
  });

  it('allows an install when a newer version exists', () => {
    expect(decide('install', { state: 'ok', available: true })).toEqual({ ok: true });
  });

  it('allows a check whenever nothing runs, even with no update', () => {
    expect(decide('check', { state: 'idle', available: false })).toEqual({ ok: true });
  });

  it('refuses a check while an update runs', () => {
    expect(decide('check', { state: 'running', available: false })).toMatchObject({ ok: false, status: 409 });
  });
});

describe('tailLog', () => {
  it('keeps the end of a long log', () => {
    expect(tailLog('abcdef', 3)).toBe('def');
    expect(tailLog('abc', 3)).toBe('abc');
  });
});
