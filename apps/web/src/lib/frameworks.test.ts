import { describe, expect, it } from 'vitest';

import { detectFrameworks } from './frameworks';

describe('detectFrameworks', () => {
  it('reads dependencies and dev dependencies', () => {
    expect(detectFrameworks(JSON.stringify({ dependencies: { express: '4' }, devDependencies: { vite: '5' } }))).toEqual([
      'Express',
      'Vite',
    ]);
  });

  it('shows the meta-framework without the libraries under it', () => {
    expect(detectFrameworks(JSON.stringify({ dependencies: { next: '15', react: '19', 'react-dom': '19' } }))).toEqual(['Next.js']);
    expect(detectFrameworks(JSON.stringify({ dependencies: { nuxt: '3', vue: '3' } }))).toEqual(['Nuxt']);
  });

  it('caps the number of labels', () => {
    const deps = { express: '1', fastify: '1', hono: '1', vite: '1' };
    expect(detectFrameworks(JSON.stringify({ dependencies: deps }))).toHaveLength(3);
  });

  it('gives nothing for unreadable or unrelated files', () => {
    expect(detectFrameworks('{not json')).toEqual([]);
    expect(detectFrameworks(JSON.stringify({ dependencies: { lodash: '4' } }))).toEqual([]);
  });
});
