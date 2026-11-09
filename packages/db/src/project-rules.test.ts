import { describe, expect, it } from 'vitest';

import { validateNewProject } from './project-rules';

const valid = {
  slug: 'smart-targets',
  repo: 'Zephyron-Tech/smart-targets-core',
  domain: 'api.smarttargets.cz',
  port: '3000',
};

describe('validateNewProject', () => {
  it('accepts the minimum and fills the defaults', () => {
    const r = validateNewProject(valid);
    expect(r).toEqual({
      ok: true,
      value: {
        slug: 'smart-targets',
        repo: 'Zephyron-Tech/smart-targets-core',
        branch: 'main',
        domain: 'api.smarttargets.cz',
        service: 'web',
        port: 3000,
        healthPath: null,
        memoryMb: 512,
        cpu: 1,
      },
    });
  });

  it('lowercases the domain and slug', () => {
    const r = validateNewProject({ ...valid, slug: 'Smart-Targets', domain: 'API.SmartTargets.cz' });
    expect(r.ok && r.value.domain).toBe('api.smarttargets.cz');
    expect(r.ok && r.value.slug).toBe('smart-targets');
  });

  it('reports each bad field by name', () => {
    const r = validateNewProject({ slug: '-bad', repo: 'no-slash', domain: 'localhost', port: '70000', healthPath: 'healthz' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['domain', 'healthPath', 'port', 'repo', 'slug']);
  });

  it('rejects a port that is not a whole number', () => {
    const r = validateNewProject({ ...valid, port: '3000.5' });
    expect(!r.ok && r.errors.port).toBeTruthy();
  });

  it('accepts a health path that starts with a slash', () => {
    const r = validateNewProject({ ...valid, healthPath: '/healthz' });
    expect(r.ok && r.value.healthPath).toBe('/healthz');
  });

  it('rejects memory and cpu outside the limits', () => {
    const r = validateNewProject({ ...valid, memoryMb: '10', cpu: '0' });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['cpu', 'memoryMb']);
  });
});
