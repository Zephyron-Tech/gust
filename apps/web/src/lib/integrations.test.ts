import { describe, expect, it } from 'vitest';

import {
  authentikValue,
  backupValue,
  breakGlassValue,
  githubAppValue,
  NOT_SET,
  parseLastBackup,
  registryValue,
  rolesValue,
} from './integrations';

describe('settings values come from configuration only', () => {
  it('shows the Authentik host, or a dash when not configured', () => {
    expect(authentikValue('https://auth.zephyron.tech/application/o/gust/')).toBe('auth.zephyron.tech · OIDC');
    expect(authentikValue(undefined)).toBe(NOT_SET);
    expect(authentikValue('not a url')).toBe(NOT_SET);
  });

  it('shows the break-glass e-mail only when set', () => {
    expect(breakGlassValue('admin@example.com')).toBe('on · admin@example.com');
    expect(breakGlassValue('')).toBe(NOT_SET);
  });

  it('names the admin group from configuration', () => {
    expect(rolesValue('gust-admin')).toContain('gust-admin');
    expect(rolesValue(undefined)).toBe(NOT_SET);
  });

  it('reports the GitHub App state, including a missing key', () => {
    expect(githubAppValue(undefined, false, 'Zephyron-Tech')).toBe(NOT_SET);
    expect(githubAppValue('5670843', false, 'Zephyron-Tech')).toBe('App 5670843 · private key missing');
    expect(githubAppValue('5670843', true, 'Zephyron-Tech')).toBe('App 5670843 · owners Zephyron-Tech');
  });

  it('shows the registry domain only when set', () => {
    expect(registryValue('registry.gust.zephyron.tech')).toContain('registry.gust.zephyron.tech');
    expect(registryValue(undefined)).toBe(NOT_SET);
  });

  it('describes a backup, or says there is none yet', () => {
    expect(backupValue(null)).toBe('No backup yet · on this server only');
    expect(backupValue({ at: '2026-11-09T03:15:00Z', bytes: 2048 })).toContain('2 KB · on this server only');
  });

  it('treats a broken backup record as no backup', () => {
    expect(parseLastBackup(null)).toBeNull();
    expect(parseLastBackup('{nope')).toBeNull();
    expect(parseLastBackup('{"at":"yesterday"}')).toBeNull();
    expect(parseLastBackup('{"at":"2026-11-09T03:15:00Z","bytes":10}')).toEqual({ at: '2026-11-09T03:15:00Z', bytes: 10 });
  });
});
