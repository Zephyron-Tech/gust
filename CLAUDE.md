# Gust

Internal deploy and monitoring platform for one VPS. Spec: zephyron.tech/admin/reports/gust.

- Monorepo: pnpm + Turborepo. `apps/web` is the Next.js UI; `apps/engine` is the Hono service that drives Docker; `packages/contracts` holds zod schemas and sample data; `packages/brand` holds logo assets and tokens. Local stack: `infra/compose.dev.yml`.
- Routing: Traefik gets its config from the engine (`GET /internal/traefik`, HTTP provider), not from Docker labels. Deploys take old containers out of that config before stopping them. See `docs/spikes.md`.
- Only the engine talks to Docker, and only through the socket proxy. Its container routes (stop, remove, logs) act only on containers labelled `gust.managed`; keep that guard on any new one.
- Requests that change state must come from Gust's own origin: `apps/web/src/proxy.ts` refuses cross-site ones before the session check. Security headers are set in `apps/web/next.config.ts`.
- Database: `packages/db` (Drizzle, Postgres 17). Change `src/schema.ts`, then `pnpm db:generate` and `pnpm db:migrate`. Real deploys: `POST /api/deployments` writes the row and enqueues a pg-boss job (`packages/db/src/queue.ts`); `apps/worker` runs it and is the only place that changes a deployment's state. The worker's reconcile loop redeploys live services whose container is gone.
- GitHub deploys: `POST /api/deploy` is authenticated by the workflow's GitHub OIDC token, not a session (`apps/web/src/lib/github-oidc.ts`); the project's `github_repo` and `production_branch` decide what a token may deploy. Shared action in `.github/actions/deploy`. See `docs/github.md`.
- Sign-in: Better Auth (`apps/web/src/lib/auth.ts`). Pages check the session in `(app)/layout.tsx`; route handlers call `requireUser(req)` and get a 401/403 otherwise. Authentik group `gust-admin` maps to role admin. Write an `audit_events` row for every change.
- UI language is English; specs and conversation are Czech.
- Styling: Tailwind with Gust tokens (`bg-bg`, `bg-bg-2`, `text-fg-2`, `text-accent` …) from `packages/brand/tokens.css`. Dark theme first, light theme via `data-theme="light"`.
- Components: Base UI primitives styled by us. No shadcn. Icons: Phosphor from `@phosphor-icons/react/ssr`.
- Status colours only for states, the accent only for actions and selection. Monospace only for literal code, hashes, paths and logs.
- Before a commit: `pnpm lint && pnpm typecheck && pnpm build`.
- Never add Claude or AI attribution (Co-Authored-By or similar) to commits or PRs.
- Env vars: `packages/db/src/secrets.ts` encrypts secrets with `GUST_MASTER_KEY` (same key in web and worker). Secret values never go to the browser except through the admin-only reveal endpoint, and never into logs or audit details.
- Production: one image (`Dockerfile`, roles in `infra/prod/entrypoint.sh`), stack in `infra/prod/compose.yml`, installed by `infra/prod/install.sh` into `/opt/gust` and run with the `gust` command. Projects are added with `gust project` (`packages/db/src/project-cli.ts`). See `docs/install.md`.
- Pages read projects and services from the database (`apps/web/src/lib/data.ts`); `@gust/contracts/sample` is only for seeding and for projects that are not on the engine yet.
