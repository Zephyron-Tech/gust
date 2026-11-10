# Goals and values

Read this before you change behaviour. It says what Gust is for and what we
trade off when two good things conflict. The spec lives in the Zephyron admin
(`zephyron.tech/admin/reports/gust`); this file is the short form for people
who write code here.

## What Gust is

Our own deploy and monitoring platform for one VPS. It replaces Vercel for
Zephyron's projects: deploys from GitHub, routing and certificates, env
variables, live logs, rollback, pull-request previews, server monitoring. It is
internal. There is one server, one team, and no plan to sell it or run it for
anyone else.

## Primary values

1. **Safe changes.** A deploy never takes a running service down. A failed
   deploy leaves the previous version serving. Health checks gate every
   switch, and the old container leaves routing before it stops.
2. **Traceable.** Every change to state writes an `audit_events` row. Every
   deploy keeps its log in Postgres, so it survives a closed tab or a worker
   restart.
3. **Secrets stay secret.** Env values are encrypted with `GUST_MASTER_KEY`.
   They reach the browser only through the admin-only reveal endpoint, and
   never reach logs or audit details.
4. **Few moving parts.** One image, one install script, one `gust` command.
   Prefer a boring tool we can debug at 2 a.m. over a clever one. A new
   dependency or service needs a reason written in the PR.
5. **Admin-grade access only.** Sign-in goes through Authentik. The
   `gust-admin` group maps to the admin role. Route handlers check the user
   (`requireUser`) and nothing is public by accident.
6. **Honest UI.** The UI says what is real. Sample data is labelled as sample,
   and a status colour means a state, never decoration.

## Goals

Each goal names a check we can run, so we know when it is met.

- **Deploy from GitHub with no manual steps.** A repo workflow with the shared
  action ships a new image to production. Check: a push to `main` goes live
  with no SSH and no SQL.
- **Zero dropped requests on a normal deploy.** Check: `pnpm spike:bluegreen`
  reports zero failures for a healthy v1 → v2 and rollback.
- **Recover without a human.** The worker redeploys a live service whose
  container disappeared. Check: kill a container, it comes back within the
  reconcile interval.
- **Every project imported, not hand-written.** Projects are added through
  the UI or `gust project`, and the database is the source of truth. Pages
  read from the database, not from sample data. Check: a new project appears
  in `/projects` with no code change.
- **Install and update in minutes.** Check: `install.sh` on a fresh Debian or
  Ubuntu VPS, then `gust update` pulls the new image and restarts.
- **Know when it breaks.** Failed deploys, failed health checks and a full
  disk are visible in the UI and the monitoring stack before a user reports
  them.

## Explicit non-goals

- Multi-server or multi-region. One VPS is the design.
- Building images on the server. CI builds, the server pulls.
- Public self-service signup. Access is by Authentik group.
- Replacing Kubernetes or a general PaaS for outside customers.

## Trade-offs we accept

- **Routing is ours, not Docker labels.** Traefik reads config from the engine.
  More code to own, but the spike showed labels drop requests during a swap.
- **Postgres and pg-boss, not an external queue.** One database to back up,
  and jobs survive a restart.
- **Sample data stays for the pages not yet on the engine.** It is labelled.
  We do not remove it until every page reads real data.

## How to use this

- A change that conflicts with a value needs a line in the PR saying which
  value and why it is worth it.
- When a goal is met, say so here and link the check. When a goal stops
  making sense, change it here, not only in code.
- The spec in the admin is the long form. If the two disagree, fix both in
  the same PR.
