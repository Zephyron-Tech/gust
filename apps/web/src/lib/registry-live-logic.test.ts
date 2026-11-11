import { describe, expect, it } from 'vitest';

import { imagesForRepo, repoOfDeploy } from './registry-live-logic';

describe('repoOfDeploy', () => {
  it('sends production and branch previews to the image itself', () => {
    expect(repoOfDeploy('demo/hello', null)).toBe('demo/hello');
    expect(repoOfDeploy('demo/hello', 'dev')).toBe('demo/hello');
  });

  it('sends a pull request preview to <image>-pr', () => {
    expect(repoOfDeploy('demo/hello', 'pr-2')).toBe('demo/hello-pr');
  });

  it('does not take a branch that only looks like a pull request', () => {
    expect(repoOfDeploy('demo/hello', 'pr-x')).toBe('demo/hello');
    expect(repoOfDeploy('demo/hello', 'pr-0')).toBe('demo/hello');
  });
});

describe('imagesForRepo', () => {
  it('maps the -pr repository back to its service image, and keeps itself for a real image of that name', () => {
    expect(imagesForRepo('demo/hello-pr')).toEqual(['demo/hello-pr', 'demo/hello']);
    expect(imagesForRepo('demo/hello')).toEqual(['demo/hello']);
  });
});
