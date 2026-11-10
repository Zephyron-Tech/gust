import { describe, expect, it } from 'vitest';

import { domainOf, hostFromRule, isObservedDir, OBSERVED_ROOT, STACK_NAME } from './observed';

describe('isObservedDir', () => {
  it('accepts folders under the observed root', () => {
    expect(OBSERVED_ROOT).toBe('/opt/docker');
    expect(isObservedDir('/opt/docker/authentik')).toBe(true);
    expect(isObservedDir('/opt/docker/outline/sub')).toBe(true);
  });

  it('refuses Gust itself, the root and anything outside it', () => {
    expect(isObservedDir('/opt/gust')).toBe(false);
    expect(isObservedDir('/opt/docker')).toBe(false);
    expect(isObservedDir('/opt/docker2/x')).toBe(false);
    expect(isObservedDir('/opt/docker/../gust')).toBe(false);
    expect(isObservedDir(undefined)).toBe(false);
  });
});

describe('STACK_NAME', () => {
  it('takes Compose project names only', () => {
    expect(STACK_NAME.test('uptime-kuma')).toBe(true);
    expect(STACK_NAME.test('a_b1')).toBe(true);
    expect(STACK_NAME.test('../gust')).toBe(false);
    expect(STACK_NAME.test('Outline')).toBe(false);
    expect(STACK_NAME.test('')).toBe(false);
  });
});

describe('hostFromRule and domainOf', () => {
  it('reads the first host of a Traefik rule', () => {
    expect(hostFromRule('Host(`auth.zephyron.tech`)')).toBe('auth.zephyron.tech');
    expect(hostFromRule('Host(`a.cz`) || Host(`b.cz`)')).toBe('a.cz');
    expect(hostFromRule('PathPrefix(`/x`)')).toBeNull();
  });

  it('finds the domain among router labels', () => {
    expect(
      domainOf({
        'traefik.enable': 'true',
        'traefik.http.routers.wiki.rule': 'Host(`wiki.zephyron.tech`)',
      }),
    ).toBe('wiki.zephyron.tech');
    expect(domainOf({ 'traefik.enable': 'true' })).toBeNull();
  });
});
