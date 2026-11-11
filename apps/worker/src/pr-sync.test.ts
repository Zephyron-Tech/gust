import { describe, expect, it } from 'vitest';

import { diffPullRequests } from './pr-sync';

const open = [{ number: 1 }, { number: 3 }];

describe('diffPullRequests', () => {
  it('closes what GitHub no longer lists as open', () => {
    const known = [
      { number: 1, state: 'open' },
      { number: 2, state: 'open' },
      { number: 3, state: 'open' },
    ];
    expect(diffPullRequests(open, known, [], true)).toEqual({ close: [2], remove: [2] });
  });

  it('leaves a pull request that is closed in Gust and on GitHub alone', () => {
    expect(diffPullRequests(open, [{ number: 5, state: 'closed' }], [], true)).toEqual({ close: [], remove: [] });
  });

  it('removes a live preview whose pull request is not open, even when Gust never had it as open', () => {
    expect(diffPullRequests(open, [{ number: 5, state: 'closed' }], [1, 5, 9], true)).toEqual({ close: [], remove: [5, 9] });
  });

  it('lists a pull request once when it is both to close and live', () => {
    expect(diffPullRequests(open, [{ number: 2, state: 'open' }], [2], true)).toEqual({ close: [2], remove: [2] });
  });

  it('does nothing when GitHub gave an incomplete list', () => {
    expect(diffPullRequests(open, [{ number: 2, state: 'open' }], [2, 9], false)).toEqual({ close: [], remove: [] });
  });
});
