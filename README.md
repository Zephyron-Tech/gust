# Gust

Our own deploy and monitoring platform for a single VPS, replacing Vercel for
Zephyron's projects: deploys from GitHub, domains with certificates, env
variables, live logs, rollback, pull-request previews and server monitoring,
behind one Authentik sign-in.

The full spec lives in the Zephyron admin: `zephyron.tech/admin/reports/gust`.

## Status

- Desktop web UI (`apps/web`). The `demo` project deploys for real through
  the engine (pick an image tag, roll back, live container logs); the deploy
  runs on the server and its state and log are kept in Postgres, so it
  survives a closed tab. The other projects are sample data.
- Database (`packages/db`): Drizzle schema for projects, services,
  deployments with logs, env vars and audit events; migrations in
  `packages/db/drizzle`.
- Engine (`apps/engine`): real blue/green deploys against local Docker with
  zero dropped requests, see `docs/spikes.md`.

## Stack

| Part                          | Choice                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo                      | pnpm workspaces, Turborepo, TypeScript 7, Node 24                                                                                |
| UI (`apps/web`)               | Next.js 16 App Router, React 19, Tailwind CSS 4, Base UI, cmdk, Phosphor icons, uPlot                                            |
| Shared (`packages/contracts`) | zod 4 schemas and sample data                                                                                                    |
| Brand (`packages/brand`)      | Logo SVGs with outlined text, icons, colour tokens                                                                               |
| Later                         | `apps/worker` (pg-boss), `apps/engine` (Hono, dockerode), `packages/db` (Drizzle, Postgres 17), Zot, Traefik v3, VictoriaMetrics |
| Tooling                       | Biome, Vitest, Playwright, GitHub Actions                                                                                        |

## Run it

```bash
pnpm install
pnpm dev                 # UI on http://localhost:3100
```

Engine and local infrastructure (Docker Desktop):

```bash
pnpm infra:up            # Traefik :80 (dashboard :8081), socket proxy, Postgres :5434, Zot :5050
cp apps/engine/.env.example apps/engine/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env
pnpm db:migrate && pnpm db:seed   # schema and Zephyron's projects
pnpm dev:engine          # engine API on http://127.0.0.1:4100
pnpm infra:demo          # build and push the demo app v1 and v2 to Zot
pnpm spike:bluegreen     # deploy under load and count failed requests
pnpm infra:down
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
