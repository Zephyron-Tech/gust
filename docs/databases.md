# Databases for projects

Status: design, first slice in code (`packages/db/src/postgres-admin.ts`, table
`project_databases`). Not wired to the UI, the worker or the network yet.

## Decision

One Postgres cluster, many small databases. Each project database gets its own
database and its own login role, created by Gust on the cluster that already
runs Gust's own database. Projects do not get containers of their own.

Why:

- **Few moving parts** (see `goals.md`). One process to watch, one upgrade, one
  place to back up. A container per project means a volume, a backup job and a
  health check each, for every database.
- **Memory on one VPS.** A Postgres instance costs a few hundred MB at idle.
  Ten small projects would need several gigabytes of RAM just to exist.
- **Isolation is enough for us.** Every project is ours, on one team. Per-database
  roles keep a project's app from reading another project's data. This is
  accepted, not a hard security boundary: the cluster's admin role can read all.

Dedicated instances stay possible. The `stateful` service type already exists in
`packages/contracts`, so a project that needs its own Postgres version, extensions
or heavy load can run one as a service. That is the exception, not the default.

The usual practice matches this: AWS's SaaS guidance and Citus's design notes both
put many small tenants in one cluster, each in its own database, and reserve a
dedicated instance for those who need one. Bytebase recommends a dedicated
database only when compliance demands it. Two things we must handle ourselves:

- New databases give `CONNECT` and `TEMP` to `PUBLIC`. Gust revokes that for each
  new database (`REVOKE ALL ON DATABASE … FROM PUBLIC`) before the role gets
  `CONNECT`.
- `pg_dump` works per database, so backups and restores are per project.

## Model

- A row in `project_databases` per database: project, name (`main`), database
  name (`<slug>_<name>`), role (`<database>_app`), encrypted password, state.
- Names are normalised to `[a-z0-9_]` and refused if longer than 63 characters.
- The password is 24 random bytes, hex, encrypted with `GUST_MASTER_KEY` like env
  secrets. It reaches the app as `DATABASE_URL` through the env system, and
  nowhere else.

## Flow (planned)

1. Admin creates a database for a project in the UI, or `gust db create`.
   Web writes the row as `provisioning` and enqueues a job, like a deploy.
2. The worker runs `createStatements` as the cluster admin, one statement per
   query. On success the row becomes `ready`; on failure `failed` with the error.
3. The env system gets `DATABASE_URL` for the project, scope `all`. A new deploy
   picks it up. Rotation runs `rotateStatements` and updates the env value.
4. Delete runs `dropStatements`, after confirmation, and writes an audit row.

## Network (planned)

Today app containers join only `gust_edge`, and Postgres is only on
`gust_internal`. A project's app that needs a database joins a `gust_data`
network with Postgres. Apps without a database stay off it.

## Backups (planned)

- Nightly and on demand: `pg_dump -Fc` per project database into the backups
  folder, with the same 14-day retention as `gust backup`.
- `pg_dumpall --globals-only` for roles, so a restore can recreate them.
- Restore a project database from its dump into a new database, after asking.
- Off-server copies stay on the list in `install.md`.

## Not doing

- A container per project database by default.
- Sharing one database between projects. Each project gets its own.
- Exposing Postgres outside the server or the internal network.

## Next steps

1. Worker job `database.provision` using `createStatements`, with integration
   tests against a throwaway Postgres.
2. `POST /api/projects/[slug]/databases` and an audit row per change.
3. Env wiring and the `gust_data` network in the deploy spec.
4. Backup job per database, and a restore path.
