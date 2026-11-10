import { describe, expect, it } from 'vitest';

import { aclDelUserArgs, aclSetUserArgs, keyPattern, redisConnectionUrl } from './redis-admin';

const plan = { database: 'smart_targets_main', role: 'smart_targets_main_app' };

describe('redis-admin', () => {
  it('limits the user to its own key prefix', () => {
    expect(keyPattern(plan)).toBe('smart_targets_main:*');
    const args = aclSetUserArgs(plan, 'pw');
    expect(args).toContain('~smart_targets_main:*');
    expect(args).toContain('-@dangerous');
  });

  it('resets passwords before setting the new one, so rotation leaves one', () => {
    const args = aclSetUserArgs(plan, 'newpw');
    expect(args.indexOf('resetpass')).toBeLessThan(args.indexOf('>newpw'));
    expect(args.slice(0, 3)).toEqual(['ACL', 'SETUSER', 'smart_targets_main_app']);
  });

  it('deletes the user by name', () => {
    expect(aclDelUserArgs(plan)).toEqual(['ACL', 'DELUSER', 'smart_targets_main_app']);
  });

  it('builds a URL with the user and password, escaped', () => {
    expect(redisConnectionUrl(plan, 'a/b')).toBe('redis://smart_targets_main_app:a%2Fb@redis:6379');
  });
});

describe('redis dumps', () => {
  it('moves a key from one prefix to another', async () => {
    const { redisKeyInto } = await import('./redis-admin');
    expect(redisKeyInto('demo_cache', 'demo_cache2', 'demo_cache:user:1')).toBe('demo_cache2:user:1');
  });

  it('refuses a key outside the source prefix', async () => {
    const { redisKeyInto } = await import('./redis-admin');
    expect(() => redisKeyInto('demo_cache', 'demo_x', 'demo_other:k')).toThrow();
  });
});
