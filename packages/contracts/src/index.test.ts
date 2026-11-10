import { describe, expect, it } from 'vitest';

import {
  branchLabel,
  deployment,
  deployRequest,
  deploySpec,
  deployTarget,
  environmentOf,
  HOSTNAME,
  pickEnv,
  previewHost,
  project,
  RUNNING_STATES,
} from './index';
import { deployments, projects } from './sample';

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

describe('preview deploys', () => {
  it('turns a branch into one DNS label', () => {
    expect(branchLabel('dev')).toBe('dev');
    expect(branchLabel('feature/Login_Page')).toBe('feature-login-page');
    expect(branchLabel('--odd--')).toBe('odd');
    expect(branchLabel('a'.repeat(60)).length).toBe(40);
  });

  it('builds the preview host under the domain', () => {
    expect(previewHost('dev', 'demo', 'gust.zephyron.tech')).toBe('dev-demo.gust.zephyron.tech');
    expect(previewHost('feature/x', 'demo', 'gust.zephyron.tech')).toBe('feature-x-demo.gust.zephyron.tech');
  });

  it('sends the production branch to production and listed branches to previews', () => {
    expect(deployTarget('refs/heads/main', 'main', ['dev'])).toEqual({ branch: null });
    expect(deployTarget('refs/heads/dev', 'main', ['dev'])).toEqual({ branch: 'dev' });
  });

  it('refuses branches that are neither production nor preview', () => {
    expect(deployTarget('refs/heads/feature', 'main', ['dev'])).toBeNull();
    expect(deployTarget('refs/tags/v1', 'main', ['dev'])).toBeNull();
    expect(deployTarget('refs/heads/dev', 'main', [])).toBeNull();
  });
});

describe('environmentOf', () => {
  it('reads production from a push and preview from a preview deploy', () => {
    expect(environmentOf({ trigger: 'push', branch: 'main' })).toEqual({ kind: 'production' });
    expect(environmentOf({ trigger: 'preview', branch: 'dev' })).toEqual({ kind: 'preview', branch: 'dev' });
  });

  it('keeps a redeploy of a preview a preview', () => {
    expect(environmentOf({ trigger: 'manual', branch: 'dev', preview: true })).toEqual({ kind: 'preview', branch: 'dev' });
  });
});

describe('pickEnv', () => {
  const rows = [
    { key: 'A', scope: 'all' as const, v: 'shared' },
    { key: 'B', scope: 'all' as const, v: 'shared' },
    { key: 'B', scope: 'preview' as const, v: 'preview' },
    { key: 'C', scope: 'production' as const, v: 'prod' },
  ];

  it('gives production the shared and production rows', () => {
    expect(pickEnv(rows, 'production').map((r) => `${r.key}=${r.v}`)).toEqual(['A=shared', 'B=shared', 'C=prod']);
  });

  it('lets a preview row override the shared one', () => {
    expect(pickEnv(rows, 'preview').map((r) => `${r.key}=${r.v}`)).toEqual(['A=shared', 'B=preview']);
  });

  it('lets the specific row win whatever the order', () => {
    const reversed = [...rows].reverse();
    expect(pickEnv(reversed, 'preview').find((r) => r.key === 'B')?.v).toBe('preview');
  });
});

describe('HOSTNAME', () => {
  it('accepts plain and nested hosts', () => {
    for (const h of ['zephyron.tech', 'app.zephyron.tech', 'a-b.c.example.cz']) expect(HOSTNAME.test(h)).toBe(true);
  });

  it('rejects wildcards, capitals, ports and bad dashes', () => {
    for (const h of ['*.zephyron.tech', 'Zephyron.tech', 'app.zephyron.tech:443', '-app.x.cz', 'app-.x.cz', 'localhost', 'http://a.cz'])
      expect(HOSTNAME.test(h)).toBe(false);
  });
});

describe('deploySpec', () => {
  const spec = { deploymentId: 'dpl_abc123', project: 'demo', service: 'hello', image: 'localhost:5050/demo/hello:v1', port: 3000 };

  it('accepts ordinary health paths and hosts, local ones too', () => {
    for (const healthPath of ['/', '/healthz', '/api/health?probe=1&deep=true'])
      expect(deploySpec.safeParse({ ...spec, healthPath }).success).toBe(true);
    expect(deploySpec.safeParse({ ...spec, domains: ['hello.localhost', 'app.example.cz'] }).success).toBe(true);
  });

  it('refuses a health path that could carry a shell command', () => {
    for (const healthPath of ['/; rm -rf /', '/$(id)', '/`id`', '/a b', "/'", '/a|b', 'healthz'])
      expect(deploySpec.safeParse({ ...spec, healthPath }).success).toBe(false);
  });

  it('refuses a host that could break out of a Traefik rule', () => {
    for (const host of ['a.cz`) || PathPrefix(`/', '*.example.cz', 'App.cz', 'a.cz:80', ''])
      expect(deploySpec.safeParse({ ...spec, domains: [host] }).success).toBe(false);
  });
});
