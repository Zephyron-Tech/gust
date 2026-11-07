import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema';

export * from './schema';
export { schema };

const url = () => process.env.DATABASE_URL ?? 'postgres://gust:gust@127.0.0.1:5434/gust';

// One pool per process. Next.js dev reloads modules on every change, so the
// pool is kept on globalThis instead of opening a new one each time.
const g = globalThis as unknown as { gustPool?: pg.Pool };
export const pool = g.gustPool ?? new pg.Pool({ connectionString: url(), max: 10 });
if (process.env.NODE_ENV !== 'production') g.gustPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
