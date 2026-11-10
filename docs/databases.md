# Databases for projects

Status: implemented for create, back up and delete. Restore and password rotation
are not built yet (see the end).

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
  name (`<slug>_<name>`), role (`<database>_app`), encrypted password, state
  (`provisioning`, `ready`, `failed`, `deleting`) and the last error.
- Names are normalised to `[a-z0-9_]` and refused if longer than 63 characters
  or empty after normalising (`planFor` in `postgres-admin.ts`).
- The password is 24 random bytes, hex, encrypted with `GUST_MASTER_KEY` like env
  secrets. It reaches the app as an env secret and nowhere else.

## Flow

1. Admin creates a database in the project's Databases page
   (`/projects/<slug>/<service>/databases`). `POST /api/projects/[slug]/databases`
   writes the row as `provisioning`, an audit row `database.create`, and enqueues a
   `database` job (`enqueueDatabase`).
2. The worker (`apps/worker/src/databases.ts`, `provisionDatabase`) runs the
   statements one by one as the cluster admin: role, database owned by the role,
   `REVOKE ALL … FROM PUBLIC`, `GRANT CONNECT`. Any failure drops what was made
   and sets the row to `failed` with the error.
3. On success the worker sets `DATABASE_URL` on the project's first `app` service
   (`DATABASE_URL_<NAME>` for the others), encrypted, scope `all`, then the row is
   `ready` and audit `database.ready` is written. The app picks the value up on
   its next deploy.
4. Delete (`DELETE /api/projects/[slug]/databases/[id]`) sets `deleting` and
   enqueues a `drop` job. The worker drops the database and role (`WITH (FORCE)`),
   removes the env value, deletes the row and writes `database.dropped`. Backups
   stay on disk.
5. Backup (`POST …/[id]/backup`) enqueues a `backup` job. The worker runs
   `pg_dump --format=custom --no-owner --no-acl` into `BACKUP_DIR` (default
   `apps/worker/backups`, `/backups` in the container) as `<database>-<stamp>.dump`
   and writes `database.backup` with the file name. The list on the page reads
   these audit rows.

### Recovery

Worker start (`recoverDatabases`): rows left `provisioning` get their partial
objects dropped and become `failed` with "Interrupted: the worker restarted…";
rows left `deleting` get a new `drop` job.

## Network

The engine connects an app container to the `gust_data` network before it starts,
when the project has a ready database (`dataNetwork` in the deploy spec, set by
the worker from `GUST_DATA_NETWORK`, default `gust_data`). Postgres sits on
`gust_internal` and `gust_data`. Apps without a database stay off `gust_data`.

## Env names

- `DATABASE_URL` for the first database of a project (in the order created).
- `DATABASE_URL_<NAME>` for the others, name upper-cased, `-` turned into `_`.

## Tools

- `PG_DUMP` overrides the `pg_dump` binary (dev on a Mac without the client
  uses a wrapper that runs it inside the Postgres container).
- The production image installs `postgresql17-client` (`Dockerfile`). The package
  name is not verified by a real build yet.

## Not doing

- A container per project database by default.
- Sharing one database between projects. Each project gets its own.
- Exposing Postgres outside the server or the internal network.

## Next steps

1. Restore: `pg_restore` of a chosen dump into a new database, after asking, with
   a UI confirmation.
2. Password rotation: `rotateStatements` exists; needs a job, a route and an env
   update.
3. Verify the Alpine package name and an engine deploy with `dataNetwork` on a real
   build.
4. Nightly backups and `pg_dumpall --globals-only` (still planned; see
   `install.md` for the backup folder).
