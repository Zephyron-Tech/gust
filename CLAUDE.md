# Gust

Internal deploy and monitoring platform for one VPS. Spec: zephyron.tech/admin/reports/gust.

- Monorepo: pnpm + Turborepo. `apps/web` is the Next.js UI; `apps/engine` is the Hono service that drives Docker; `packages/contracts` holds zod schemas and sample data; `packages/brand` holds logo assets and tokens. Local stack: `infra/compose.dev.yml`.
- Routing: Traefik gets its config from the engine (`GET /internal/traefik`, HTTP provider), not from Docker labels. Deploys take old containers out of that config before stopping them. See `docs/spikes.md`.
- Only the engine talks to Docker, and only through the socket proxy.
- Database: `packages/db` (Drizzle, Postgres 17). Change `src/schema.ts`, then `pnpm db:generate` and `pnpm db:migrate`. Real deploys are started by `POST /api/deployments` and run on the server (`apps/web/src/lib/deploy-runner.ts`); this moves to `apps/worker` later.
- Sign-in: Better Auth (`apps/web/src/lib/auth.ts`). Pages check the session in `(app)/layout.tsx`; route handlers call `requireUser(req)` and get a 401/403 otherwise. Authentik group `gust-admins` maps to role admin. Write an `audit_events` row for every change.
- UI language is English; specs and conversation are Czech.
- Styling: Tailwind with Gust tokens (`bg-bg`, `bg-bg-2`, `text-fg-2`, `text-accent` …) from `packages/brand/tokens.css`. Dark theme first, light theme via `data-theme="light"`.
- Components: Base UI primitives styled by us. No shadcn. Icons: Phosphor from `@phosphor-icons/react/ssr`.
- Status colours only for states, the accent only for actions and selection. Monospace only for literal code, hashes, paths and logs.
- Before a commit: `pnpm lint && pnpm typecheck && pnpm build`.
- Never add Claude or AI attribution (Co-Authored-By or similar) to commits or PRs.
