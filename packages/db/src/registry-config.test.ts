import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';

import { accountName, generatePassword, hashPassword, renderHtpasswd, renderZotConfig, ZOT_BASE, type ZotBase } from './registry-config';

const base: ZotBase = {
  storage: { rootDirectory: '/var/lib/registry', gc: true },
  http: { address: '0.0.0.0', port: '5000', realm: 'gust', auth: { failDelay: 1 } },
  log: { level: 'info' },
};

describe('generatePassword', () => {
  it('makes 32 characters from the safe alphabet, different each time', () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).toMatch(/^[A-Za-z2-9]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe('hashPassword', () => {
  it('stores a bcrypt hash that checks against the password', () => {
    const hash = hashPassword('correct horse battery');
    expect(hash.startsWith('$2')).toBe(true);
    expect(bcrypt.compareSync('correct horse battery', hash)).toBe(true);
    expect(bcrypt.compareSync('wrong', hash)).toBe(false);
  });
});

describe('renderHtpasswd', () => {
  it('writes one user:hash line per account', () => {
    const out = renderHtpasswd([
      { username: 'gust', hash: '$2a$10$x' },
      { username: 'ci-demo', hash: '$2a$10$y' },
    ]);
    expect(out).toBe('gust:$2a$10$x\nci-demo:$2a$10$y\n');
  });
});

describe('renderZotConfig', () => {
  it('gives each project push rights only under its own prefix', () => {
    const cfg = renderZotConfig(base, [{ slug: 'demo' }, { slug: 'smart-targets' }], '/etc/zot-auth/htpasswd');
    const repos = cfg.http.accessControl.repositories;
    expect(repos['demo/**']?.policies).toEqual([
      { users: ['ci-demo'], actions: ['read', 'create', 'update', 'delete'] },
      { users: ['gust'], actions: ['read'] },
    ]);
    expect(repos['smart-targets/**']?.policies[0]).toEqual({
      users: ['ci-smart-targets'],
      actions: ['read', 'create', 'update', 'delete'],
    });
    expect(repos['smart-targets/**']?.policies[1]).toEqual({ users: ['gust'], actions: ['read'] });
    expect(repos['**']?.policies).toEqual([{ users: ['gust'], actions: ['read'] }]);
  });

  it('has no shared ci account: every push rule names one project account', () => {
    const cfg = renderZotConfig(base, [{ slug: 'demo' }], '/x');
    expect(JSON.stringify(cfg)).not.toContain('"ci"');
    expect(cfg.http.accessControl.repositories['demo/**']?.policies[0]).toEqual({
      users: ['ci-demo'],
      actions: ['read', 'create', 'update', 'delete'],
    });
    expect(cfg.http.accessControl.repositories['demo/**']?.policies[1]).toEqual({ users: ['gust'], actions: ['read'] });
  });

  it('keeps storage and log from the base and points auth at the htpasswd path', () => {
    const cfg = renderZotConfig(base, [], '/etc/zot-auth/htpasswd');
    expect(cfg.storage).toEqual(base.storage);
    expect(cfg.log).toEqual(base.log);
    expect(cfg.http.auth.htpasswd.path).toBe('/etc/zot-auth/htpasswd');
    expect(cfg.http.accessControl.repositories['**']?.policies).toEqual([{ users: ['gust'], actions: ['read'] }]);
  });
});

describe('accountName', () => {
  it('prefixes the slug with ci-', () => {
    expect(accountName('demo')).toBe('ci-demo');
  });
});

describe('ZOT_BASE retention', () => {
  it('keeps the 20 newest pushed tags per repository, with the delay before a tag is removed', () => {
    const retention = ZOT_BASE.storage.retention as {
      delay: string;
      policies: { keepTags: { mostRecentlyPushedCount: number }[] }[];
    };
    expect(retention.delay).toBe('24h');
    expect(retention.policies[0]?.keepTags).toEqual([{ mostRecentlyPushedCount: 20 }]);
  });
});
