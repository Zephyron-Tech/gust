import { describe, expect, it } from 'vitest';

import { dumpTime, expiredDumps, isInside, restoreArgs } from './backup-files';

describe('isInside', () => {
  it('accepts a file in the folder', () => {
    expect(isInside('/srv/backups', '/srv/backups/demo_api-2026-11-10T13-38-39-417Z.dump')).toBe(true);
  });
  it('refuses a file outside, a parent path or the folder itself', () => {
    expect(isInside('/srv/backups', '/srv/other/x.dump')).toBe(false);
    expect(isInside('/srv/backups', '/srv/backups/../secrets.dump')).toBe(false);
    expect(isInside('/srv/backups', '/srv/backups')).toBe(false);
  });
});

describe('restoreArgs', () => {
  it('restores as the app role without owners or ACLs', () => {
    const args = restoreArgs({
      host: 'h',
      port: '5432',
      username: 'gust',
      database: 'demo_copy',
      role: 'demo_copy_app',
      file: '/b/x.dump',
    });
    expect(args.slice(0, 4)).toEqual(['--no-owner', '--no-acl', '--role', 'demo_copy_app']);
    expect(args.at(-1)).toBe('/b/x.dump');
    expect(args).toContain('demo_copy');
  });
});

describe('dumpTime and expiredDumps', () => {
  const old = 'demo_api-2026-10-01T03-00-00-000Z.dump';
  const fresh = 'demo_api-2026-11-09T03-00-00-000Z.dump';
  it('reads the stamp', () => {
    expect(dumpTime(fresh)).toBe(Date.parse('2026-11-09T03:00:00.000Z'));
    expect(dumpTime('notes.txt')).toBeNull();
  });
  it('lists only old dumps and never other files', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    expect(expiredDumps([old, fresh, 'backup.tar.gz', 'Bad-2026-01-01T00-00-00-000Z.dump'], now, 14)).toEqual([old]);
  });
});
