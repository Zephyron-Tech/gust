import { describe, expect, it } from 'vitest';

import { deployment, deployRequest, observedStack, project, RUNNING_STATES } from './index';
import { deployments, observed, projects } from './sample';

describe('deployRequest', () => {
  it('accepts project/service and a tag', () => {
    expect(deployRequest.parse({ service: 'smart-targets/api', tag: 'a1c9e3f' })).toEqual({ service: 'smart-targets/api', tag: 'a1c9e3f' });
  });

  it('rejects a service without a project', () => {
    expect(deployRequest.safeParse({ service: 'api', tag: 'a1c9e3f' }).success).toBe(false);
  });

  it('rejects an empty tag', () => {
    expect(deployRequest.safeParse({ service: 'smart-targets/api', tag: '' }).success).toBe(false);
  });
});

describe('sample data', () => {
  it('matches the schemas', () => {
    for (const p of projects) project.parse(p);
    for (const d of deployments) deployment.parse(d);
    for (const o of observed) observedStack.parse(o);
  });

  it('has at most one live deployment per service', () => {
    const live = deployments.filter((d) => d.state === 'live').map((d) => `${d.project}/${d.service}`);
    expect(new Set(live).size).toBe(live.length);
  });

  it('only references services that exist', () => {
    for (const d of deployments) {
      const p = projects.find((x) => x.slug === d.project);
      expect(p?.services.some((s) => s.name === d.service)).toBe(true);
    }
  });
});

describe('RUNNING_STATES', () => {
  it('excludes final states', () => {
    for (const s of ['live', 'failed', 'superseded', 'cancelled'] as const) expect(RUNNING_STATES).not.toContain(s);
  });
});
