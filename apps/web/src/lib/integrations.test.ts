import { describe, expect, it } from 'vitest';

import {
  authentikValue,
  backupSizeKb,
  breakGlassValue,
  discordValue,
  githubAppValue,
  heartbeatValue,
  imageCleanupValue,
  NOT_SET,
  parseLastBackup,
  parseRegistryKeep,
  parseServerFacts,
  registryValue,
  rolesValue,
  serverFactsValue,
  wildcardDnsValue,
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

  it('shows backup size in KB, at least 1', () => {
    expect(backupSizeKb(2048)).toBe(2);
    expect(backupSizeKb(10)).toBe(1);
  });

  it('reads the machine facts the host wrote', () => {
    const raw = '{"os":"Ubuntu 24.04 LTS","vcpu":2,"ramGb":4,"diskGb":40,"uptimeSec":3600,"at":"2026-11-09T12:00:00Z"}';
    const f = parseServerFacts(raw);
    expect(serverFactsValue(f)).toBe('Ubuntu 24.04 LTS · 2 vCPU · 4 GB RAM · 40 GB disk');
    expect(serverFactsValue(null)).toBe(NOT_SET);
    expect(parseServerFacts('{"os":"x"}')).toBeNull();
  });

  it('shows the heartbeat only when a URL is configured', () => {
    expect(heartbeatValue(false)).toBe(NOT_SET);
    expect(heartbeatValue(true)).toContain('healthchecks.io');
  });

  it('reads the registry retention the host wrote', () => {
    expect(parseRegistryKeep('{"keepTags":8,"at":"2026-11-09T12:00:00Z"}')).toBe(8);
    expect(parseRegistryKeep('{"keepTags":null}')).toBeNull();
    expect(parseRegistryKeep('{"keepTags":"8"}')).toBeNull();
    expect(parseRegistryKeep(null)).toBeNull();
    expect(imageCleanupValue(8)).toBe('registry keeps last 4 pushes (8 tags)');
    expect(imageCleanupValue(null)).toBe(NOT_SET);
  });

  it('shows the wildcard DNS state from a real lookup', () => {
    const ip = '85.9.209.58';
    expect(wildcardDnsValue('gust.zephyron.tech', null, ['85.9.209.58'])).toBe(NOT_SET);
    expect(wildcardDnsValue(undefined, ip, ['85.9.209.58'])).toBe(NOT_SET);
    expect(wildcardDnsValue('gust.zephyron.tech', ip, null)).toBe('*.gust.zephyron.tech · not set up');
    expect(wildcardDnsValue('gust.zephyron.tech', ip, ['85.9.209.58'])).toBe('*.gust.zephyron.tech → 85.9.209.58 · this server');
    expect(wildcardDnsValue('gust.zephyron.tech', ip, ['1.2.3.4'])).toBe('*.gust.zephyron.tech → 1.2.3.4 · not this server');
  });

  it('shows Discord only when a webhook is configured', () => {
    expect(discordValue(false)).toBe(NOT_SET);
    expect(discordValue(true)).toContain('webhook set');
  });

  it('treats a broken backup record as no backup', () => {
    expect(parseLastBackup(null)).toBeNull();
    expect(parseLastBackup('{nope')).toBeNull();
    expect(parseLastBackup('{"at":"yesterday"}')).toBeNull();
    expect(parseLastBackup('{"at":"2026-11-09T03:15:00Z","bytes":10}')).toEqual({ at: '2026-11-09T03:15:00Z', bytes: 10 });
  });
});
