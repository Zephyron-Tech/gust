// SQL for per-project databases on the shared Postgres cluster: one database and
// one login role per (project, name). Pure: it builds statements and runs none.
// The worker runs them as the cluster admin, one statement per query, because
// CREATE DATABASE cannot run inside a transaction block.
import { randomBytes } from 'node:crypto';

const MAX_IDENT = 63; // Postgres truncates longer identifiers, so refuse them instead.

/** The database and role of one project database. */
export type DbPlan = { database: string; role: string };

/** A name in the database namespace: lowercase letters, digits and underscores. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The database and role for one database of one project, e.g. `smart_targets_main`. */
export function planFor(slug: string, name: string): { database: string; role: string } {
  // A name with nothing left after normalising would make the database just the slug: refuse it.
  if (!normalizeName(name)) throw new Error('Enter a name with letters or digits');
  const base = normalizeName(`${slug}_${name}`);
  if (!/^[a-z]/.test(base)) throw new Error(`"${slug}_${name}" has no usable name`);
  if (base.length > MAX_IDENT) throw new Error(`"${base}" is longer than ${MAX_IDENT} characters`);
  return { database: base, role: `${base}_app` };
}

/** Double-quoted identifier. Quotes inside the name are doubled. */
export function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Single-quoted literal. Only used for generated passwords, which are hex, but escaped anyway. */
export function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** A new password: 24 random bytes as hex, so it needs no escaping in a URL either. */
export function randomPassword(): string {
  return randomBytes(24).toString('hex');
}

/** Statements that create the role and database. Order matters: the role must exist first. */
export function createStatements(plan: { database: string; role: string }, password: string): string[] {
  const db = ident(plan.database);
  const role = ident(plan.role);
  return [
    `CREATE ROLE ${role} LOGIN PASSWORD ${literal(password)}`,
    `CREATE DATABASE ${db} OWNER ${role}`,
    // New databases grant CONNECT and TEMP to PUBLIC, so every login could reach them.
    `REVOKE ALL ON DATABASE ${db} FROM PUBLIC`,
    `GRANT CONNECT ON DATABASE ${db} TO ${role}`,
  ];
}

/** Statements that change only the password. */
export function rotateStatements(plan: { role: string }, password: string): string[] {
  return [`ALTER ROLE ${ident(plan.role)} PASSWORD ${literal(password)}`];
}

/** Statements that remove the database, then the role. FORCE ends open connections (Postgres 13+). */
export function dropStatements(plan: { database: string; role: string }): string[] {
  return [`DROP DATABASE IF EXISTS ${ident(plan.database)} WITH (FORCE)`, `DROP ROLE IF EXISTS ${ident(plan.role)}`];
}

/** The URL a project's app receives as DATABASE_URL. The host is the cluster's service name on the internal network. */
export function connectionUrl(plan: { database: string; role: string }, password: string, host = 'postgres', port = 5432): string {
  return `postgres://${encodeURIComponent(plan.role)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(plan.database)}`;
}
