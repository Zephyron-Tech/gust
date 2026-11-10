import { describe, expect, it } from 'vitest';

import { validateNewProject, validatePreviewBranches } from './project-rules';

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
        previewBranches: [],
        service: 'web',
        port: 3000,
        healthPath: null,
        memoryMb: 512,
        cpu: 1,
      },
    });
  });

  it('leaves the domain out for the automatic host and takes preview branches', () => {
    const r = validateNewProject({ ...valid, domain: '', previewBranches: ['dev', ' staging '] });
    expect(r.ok && r.value.domain).toBeNull();
    expect(r.ok && r.value.previewBranches).toEqual(['dev', 'staging']);
  });

  it('refuses the production branch as a preview', () => {
    const r = validateNewProject({ ...valid, branch: 'main', previewBranches: ['main'] });
    expect(!r.ok && r.errors.previewBranches).toBeTruthy();
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

  it('rejects a health path with shell or quote characters', () => {
    for (const healthPath of ['/; reboot', '/$(id)', '/a b', '/"x"']) {
      const r = validateNewProject({ ...valid, healthPath });
      expect(!r.ok && r.errors.healthPath).toBeTruthy();
    }
  });

  it('rejects memory and cpu outside the limits', () => {
    const r = validateNewProject({ ...valid, memoryMb: '10', cpu: '0' });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['cpu', 'memoryMb']);
  });
});

describe('validatePreviewBranches', () => {
  it('accepts a list of distinct branches', () => {
    expect(validatePreviewBranches([' dev ', 'staging'], 'main')).toEqual({ ok: true, value: ['dev', 'staging'] });
  });

  it('accepts an empty list', () => {
    expect(validatePreviewBranches([], 'main')).toEqual({ ok: true, value: [] });
  });

  it('rejects the production branch, duplicates and bad names', () => {
    expect(validatePreviewBranches(['main'], 'main').ok).toBe(false);
    expect(validatePreviewBranches(['dev', 'dev'], 'main').ok).toBe(false);
    expect(validatePreviewBranches(['bad name'], 'main').ok).toBe(false);
  });

  it('caps the number of preview branches', () => {
    const many = Array.from({ length: 11 }, (_, i) => `b${i}`);
    expect(validatePreviewBranches(many, 'main').ok).toBe(false);
  });
});
