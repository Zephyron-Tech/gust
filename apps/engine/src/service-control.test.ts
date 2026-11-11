import { LABEL } from '@gust/contracts';
import { describe, expect, it } from 'vitest';

import { inScope } from './service-control';

const production = { [LABEL.managed]: 'true' };
const preview = { [LABEL.managed]: 'true', [LABEL.branch]: 'dev' };

describe('inScope', () => {
  it('production takes only containers without a branch label', () => {
    expect(inScope(production, 'production')).toBe(true);
    expect(inScope(preview, 'production')).toBe(false);
  });

  it('previews take only containers with a branch label', () => {
    expect(inScope(preview, 'previews')).toBe(true);
    expect(inScope(production, 'previews')).toBe(false);
  });

  it('all takes both', () => {
    expect(inScope(production, 'all')).toBe(true);
    expect(inScope(preview, 'all')).toBe(true);
  });
});
