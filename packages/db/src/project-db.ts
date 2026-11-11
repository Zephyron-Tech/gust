// Looks into one project database, for the Storage pages: its tables, rows and ad-hoc SQL.
// It connects with the database's own login (never the cluster admin), so a query can reach
// that database and nothing else. The connection lives for one call and is always closed.
import pg from 'pg';

import { ident } from './postgres-admin';
import { decryptSecret } from './secrets';

export const PAGE_SIZE = 50;
export const MAX_RESULT_ROWS = 500;
const MAX_CELL = 2000;
const STATEMENT_TIMEOUT_MS = 15_000;

export type ProjectDbTarget = { database: string; role: string; passwordEncrypted: string };

/** Host and port of the cluster, from DATABASE_URL (the same server the worker creates databases on). */
function clusterAddress() {
  const url = new URL(process.env.DATABASE_URL ?? 'postgres://gust:gust@127.0.0.1:5434/gust');
  return { host: url.hostname, port: Number(url.port || 5432) };
}

/**
 * Runs `fn` on a connection as the database's own login. `readOnly` wraps it in a READ ONLY
 * transaction, so Postgres itself refuses INSERT, UPDATE, DELETE and DDL.
 */
export async function withProjectDb<T>(
  target: ProjectDbTarget,
  opts: { readOnly: boolean },
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({
    ...clusterAddress(),
    database: target.database,
    user: target.role,
    password: decryptSecret(target.passwordEncrypted),
    application_name: 'gust-console',
    statement_timeout: STATEMENT_TIMEOUT_MS,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    await client.query(opts.readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    try {
      const out = await fn(client);
      await client.query(opts.readOnly ? 'ROLLBACK' : 'COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    }
  } finally {
    await client.end().catch(() => {});
  }
}

/** One value as the page shows it: bytes as a size, dates as ISO, objects as JSON, long text cut. */
export function cell(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  let s: string;
  if (Buffer.isBuffer(v)) s = `<${v.length} bytes>`;
  else if (v instanceof Date) s = Number.isNaN(v.getTime()) ? 'invalid date' : v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL)}…` : s;
}

export type TableInfo = { name: string; kind: 'table' | 'view'; estimate: number };
export type ColumnInfo = { name: string; type: string; nullable: boolean; pk: boolean };
export type Grid = { columns: string[]; rows: (string | null)[][] };

/** Tables and views in the public schema, with Postgres's own row estimate (no full count). */
export async function listTables(client: pg.Client): Promise<{ tables: TableInfo[]; size: number }> {
  const t = await client.query<{ name: string; kind: string; estimate: string }>(
    `select c.relname as name, c.relkind as kind, greatest(c.reltuples, 0)::bigint as estimate
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      order by c.relname`,
  );
  const s = await client.query<{ size: string }>('select pg_database_size(current_database()) as size');
  return {
    tables: t.rows.map((r) => ({ name: r.name, kind: r.kind === 'v' || r.kind === 'm' ? 'view' : 'table', estimate: Number(r.estimate) })),
    size: Number(s.rows[0]?.size ?? 0),
  };
}

/** Columns and one page of rows of a table. The name must be one `listTables` returned. */
export async function tablePage(
  client: pg.Client,
  table: string,
  page: number,
): Promise<{ columns: ColumnInfo[]; grid: Grid; hasMore: boolean }> {
  const qualified = `${ident('public')}.${ident(table)}`;
  const cols = await client.query<{ name: string; type: string; nullable: boolean; pk: boolean }>(
    `select a.attname as name, format_type(a.atttypid, a.atttypmod) as type, not a.attnotnull as nullable,
            coalesce(a.attnum = any(ix.indkey), false) as pk
       from pg_attribute a left join pg_index ix on ix.indrelid = a.attrelid and ix.indisprimary
      where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
      order by a.attnum`,
    [qualified],
  );
  const order = cols.rows.filter((c) => c.pk).map((c) => ident(c.name));
  const offset = Math.max(0, Math.floor(page)) * PAGE_SIZE;
  const res = await client.query({
    text: `select * from ${qualified}${order.length ? ` order by ${order.join(', ')}` : ''} limit ${PAGE_SIZE + 1} offset ${offset}`,
    rowMode: 'array',
  });
  return {
    columns: cols.rows,
    grid: { columns: res.fields.map((f) => f.name), rows: (res.rows as unknown[][]).slice(0, PAGE_SIZE).map((r) => r.map(cell)) },
    hasMore: res.rows.length > PAGE_SIZE,
  };
}

export type QueryResult = { grid: Grid; rowCount: number; truncated: boolean; command: string; ms: number };

/** Runs one SQL text. Several statements run too; the result is the last one's. */
export async function runQuery(client: pg.Client, sql: string): Promise<QueryResult> {
  const started = Date.now();
  const raw = (await client.query({ text: sql, rowMode: 'array' })) as pg.QueryResult | pg.QueryResult[];
  const res = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  const rows = (res?.rows ?? []) as unknown[][];
  return {
    grid: { columns: (res?.fields ?? []).map((f) => f.name), rows: rows.slice(0, MAX_RESULT_ROWS).map((r) => r.map(cell)) },
    rowCount: res?.rowCount ?? rows.length,
    truncated: rows.length > MAX_RESULT_ROWS,
    command: res?.command ?? '',
    ms: Date.now() - started,
  };
}
