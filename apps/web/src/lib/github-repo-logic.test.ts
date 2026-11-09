import { describe, expect, it } from 'vitest';

import { newFileUrl, ownerAllowed, readDockerfile, slugFromRepo, usesGustAction, workflowYaml } from './github-repo-logic';

describe('readDockerfile', () => {
  it('reads the first exposed port', () => {
    expect(readDockerfile('FROM node:22\nEXPOSE 3000\nCMD ["node","s.js"]').port).toBe(3000);
    expect(readDockerfile('expose 8080/tcp 9090').port).toBe(8080);
  });

  it('gives null without EXPOSE or with a variable', () => {
    expect(readDockerfile('FROM nginx').port).toBeNull();
    expect(readDockerfile('EXPOSE $PORT').port).toBeNull();
  });

  it('finds a health path in HEALTHCHECK, also over continued lines', () => {
    const df = 'HEALTHCHECK --interval=10s \\\n  CMD wget -qO- http://localhost:3000/healthz || exit 1';
    expect(readDockerfile(df).healthPath).toBe('/healthz');
    expect(readDockerfile('HEALTHCHECK CMD curl -f http://127.0.0.1/api/health').healthPath).toBe('/api/health');
  });
});

describe('repository helpers', () => {
  it('allows only the listed owners, in any case', () => {
    expect(ownerAllowed('zephyron-tech/gust', ['Zephyron-Tech'])).toBe(true);
    expect(ownerAllowed('someone/gust', ['Zephyron-Tech'])).toBe(false);
  });

  it('turns a repository name into a slug', () => {
    expect(slugFromRepo('ReceiptSplitter')).toBe('receiptsplitter');
    expect(slugFromRepo('esn_uwb.web')).toBe('esn-uwb-web');
  });

  it('spots the Gust action in a workflow', () => {
    expect(usesGustAction('- uses: Zephyron-Tech/gust/.github/actions/deploy@main')).toBe(true);
    expect(usesGustAction('- uses: actions/checkout@v5')).toBe(false);
  });
});

describe('workflowYaml', () => {
  const yaml = workflowYaml({ gustUrl: 'https://gust.zephyron.tech', project: 'orbit', service: 'web', branches: ['main', 'dev'] });

  it('builds on the production and preview branches', () => {
    expect(yaml).toContain('branches: [main, dev]');
  });

  it('names the service and image and keeps secrets as expressions', () => {
    expect(yaml).toContain('service: web');
    expect(yaml).toContain('image: orbit/web');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, not a template
    expect(yaml).toContain('${{ secrets.GUST_REGISTRY_PASSWORD }}');
    expect(usesGustAction(yaml)).toBe(true);
  });

  it('links to a prefilled new file on GitHub', () => {
    const url = newFileUrl('Zephyron-Tech/orbit', 'main', '.github/workflows/gust-deploy.yml', 'a b');
    expect(url).toBe('https://github.com/Zephyron-Tech/orbit/new/main?filename=.github%2Fworkflows%2Fgust-deploy.yml&value=a%20b');
  });
});
