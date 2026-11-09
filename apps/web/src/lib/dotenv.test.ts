import { describe, expect, it } from 'vitest';

import { parseDotenv } from './dotenv';

describe('parseDotenv', () => {
  it('reads keys and values, skipping comments and blank lines', () => {
    expect(parseDotenv('# db\nDATABASE_URL=postgres://x\n\nexport PORT=3000 # web\n')).toEqual([
      { key: 'DATABASE_URL', value: 'postgres://x' },
      { key: 'PORT', value: '3000' },
    ]);
  });

  it('drops quotes and keeps = and # inside them', () => {
    expect(parseDotenv(`A="x=1 # not a comment"\nB='y'`)).toEqual([
      { key: 'A', value: 'x=1 # not a comment' },
      { key: 'B', value: 'y' },
    ]);
  });

  it('turns \\n into a newline in double quotes', () => {
    expect(parseDotenv('KEY="a\\nb"')[0]?.value).toBe('a\nb');
  });
});
