import { describe, expect, it } from 'vitest';

import { gh, statusBody } from './github';

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

describe('gh', () => {
  it('accepts an empty body, as a secret update answers 204 No Content', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    try {
      await expect(gh('/repos/o/r/actions/secrets/X', 'token t', { method: 'PUT' })).resolves.toEqual({});
    } finally {
      globalThis.fetch = original;
    }
  });

  it('still parses a JSON body', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('{"key_id":"1"}', { status: 200 })) as typeof fetch;
    try {
      await expect(gh('/x', 'token t')).resolves.toEqual({ key_id: '1' });
    } finally {
      globalThis.fetch = original;
    }
  });
});
