import { describe, expect, it } from 'vitest';

import {
  connectionUrl,
  createStatements,
  dropStatements,
  ident,
  literal,
  planFor,
  randomPassword,
  rotateStatements,
} from './postgres-admin';

describe('planFor', () => {
  it('turns the slug and the name into a database and a role', () => {
    expect(planFor('smart-targets', 'main')).toEqual({ database: 'smart_targets_main', role: 'smart_targets_main_app' });
  });

  it('refuses a name with no letters to start with', () => {
    expect(() => planFor('---', '1')).toThrow();
  });

  it('refuses a name that normalises to nothing, instead of naming the database after the slug', () => {
    expect(() => planFor('demo', '---')).toThrow(/letters or digits/);
    expect(() => planFor('demo', '  ')).toThrow(/letters or digits/);
  });

  it('refuses a name over the identifier limit instead of letting Postgres truncate it', () => {
    expect(() => planFor('a'.repeat(60), 'main')).toThrow(/longer than 63/);
  });
});

describe('quoting', () => {
  it('doubles double quotes in identifiers and single quotes in literals', () => {
    expect(ident('we"ird')).toBe('"we""ird"');
    expect(literal("it's")).toBe("'it''s'");
  });
});

describe('createStatements', () => {
  const plan = { database: 'shop_main', role: 'shop_main_app' };

  it('creates the role before the database it owns, then cuts PUBLIC off', () => {
    expect(createStatements(plan, 'abc')).toEqual([
      `CREATE ROLE "shop_main_app" LOGIN PASSWORD 'abc'`,
      `CREATE DATABASE "shop_main" OWNER "shop_main_app"`,
      `REVOKE ALL ON DATABASE "shop_main" FROM PUBLIC`,
      `GRANT CONNECT ON DATABASE "shop_main" TO "shop_main_app"`,
    ]);
  });
});

describe('rotate and drop', () => {
  it('rotates only the password', () => {
    expect(rotateStatements({ role: 'shop_main_app' }, 'new')).toEqual([`ALTER ROLE "shop_main_app" PASSWORD 'new'`]);
  });

  it('drops the database with FORCE before its role', () => {
    expect(dropStatements({ database: 'shop_main', role: 'shop_main_app' })).toEqual([
      `DROP DATABASE IF EXISTS "shop_main" WITH (FORCE)`,
      `DROP ROLE IF EXISTS "shop_main_app"`,
    ]);
  });
});

describe('connectionUrl', () => {
  it('encodes the parts and points at the cluster service', () => {
    expect(connectionUrl({ database: 'shop_main', role: 'shop_main_app' }, 'p@ss/word')).toBe(
      'postgres://shop_main_app:p%40ss%2Fword@postgres:5432/shop_main',
    );
  });
});

describe('randomPassword', () => {
  it('is 48 hex characters and differs each time', () => {
    const a = randomPassword();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(randomPassword()).not.toBe(a);
  });
});
