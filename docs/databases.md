# Databases for projects

Status: implemented: create, back up, nightly backups with retention, restore into a
new database, password rotation, delete. Verified on the dev stack (see Next steps for
what is not verified).

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

6. Restore (`POST …/databases/restore`, body `{file, name}`). The route takes the
   file name from the list, looks it up in this project's `database.backup` audit rows
   and passes the full path to the job, so a client never names an arbitrary path. It
   creates a new database (same as create), then the worker runs `pg_restore --no-owner
   --no-acl --role <app role>`, so the objects belong to the app role. The current
   database is never touched. Audit `database.restore`. A failing restore marks the new
   database `failed` with the pg_restore message; the user deletes it.
7. Rotate (`POST …/[id]/rotate`). The worker sets a new random password with
   `ALTER ROLE … PASSWORD`, stores it encrypted and rewrites `DATABASE_URL` on the app.
   The old password stops working at once, so the running app fails new connections
   until it is redeployed. Audit `database.rotate`.
8. Nightly (queue `database-backup-nightly`, cron `BACKUP_CRON`, default `0 3 * * *`,
   time zone `BACKUP_TZ`, default `Europe/Prague`). Dumps every ready database, then
   removes dumps older than `BACKUP_KEEP_DAYS` (default 14). Only files named
   `<database>-<stamp>.dump` are ever removed.

### Recovery

Worker start (`recoverDatabases`): rows left `provisioning` get their partial
objects dropped and become `failed` with "Interrupted: the worker restarted…";
rows left `deleting` get a new `drop` job. A restore cut off by a crash is in the
same state as a half-made database: it is `provisioning`, so it is dropped and
marked failed. Restores finished but not yet marked `ready` are not an issue, since
the state changes only after pg_restore returns.

## Network

The engine connects an app container to the `gust_data` network before it starts,
when the project has a ready database (`dataNetwork` in the deploy spec, set by
the worker from `GUST_DATA_NETWORK`, default `gust_data`). Postgres sits on
`gust_internal` and `gust_data`. Apps without a database stay off `gust_data`.

## Env names

- `DATABASE_URL` for the first database of a project (in the order created).
- `DATABASE_URL_<NAME>` for the others, name upper-cased, `-` turned into `_`.

## Tools and settings

- `PG_DUMP`, `PG_RESTORE` override the client binaries (dev on a Mac without the
  client uses wrappers that run them in the Postgres container).
- `BACKUP_DIR`, `BACKUP_CRON`, `BACKUP_TZ`, `BACKUP_KEEP_DAYS` as above.
- The production image installs `postgresql17-client` (`Dockerfile`), which has
  `pg_dump` and `pg_restore`. Checked: the package exists in Alpine v3.22 and v3.23
  (pkgs.alpinelinux.org); the Postgres server and `pg_dump` in `postgres:17-alpine`
  both report 17.11.

## Not doing

- A container per project database by default.
- Sharing one database between projects. Each project gets its own.
- Exposing Postgres outside the server or the internal network.

## Checked on the dev stack

- Engine deploy with `dataNetwork`: the app container joins `gust_edge` and `gust_data`,
  resolves `postgres` and opens `postgres:5432`. A container without the network gets
  `ENOTFOUND`. The engine ran against a socket proxy with the production env.
- The Storage page (`/storage`) lists every project database with its state and last backup.

## Next steps

1. A real `docker build` of the image: Docker Hub and the Alpine package mirror were
   unreachable from the dev sandbox, so `apk add postgresql17-client` was not run in a build.
2. Restore into the same database (overwrite) is deliberately not offered.
