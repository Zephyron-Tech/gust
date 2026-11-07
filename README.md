# Gust

Our own deploy and monitoring platform for a single VPS, replacing Vercel for
Zephyron's projects: deploys from GitHub, domains with certificates, env
variables, live logs, rollback, pull-request previews and server monitoring,
behind one Authentik sign-in.

The full spec lives in the Zephyron admin: `zephyron.tech/admin/reports/gust`.

## Status

Phase 0: the desktop web UI with sample data. No backend yet; deploys,
rollbacks and alerts are simulated in the browser.

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
pnpm dev        # http://localhost:3100
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
