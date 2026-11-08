import { describe, expect, it } from 'vitest';

import { statusBody } from './github';

describe('statusBody', () => {
  it('names the service in the context and links the deployment', () => {
    expect(statusBody('pending', 'api', 'https://gust/x')).toEqual({
      state: 'pending',
      context: 'gust/api',
      target_url: 'https://gust/x',
      description: 'Deploying…',
    });
  });

  it('carries the error of a failed deploy, cut to what GitHub accepts', () => {
    const body = statusBody('failure', 'api', 'u', 'x'.repeat(300));
    expect(body.description).toHaveLength(140);
  });
});
