# Spikes

## 1. Blue/green without dropped requests (M0) — passed, design changed

**Question.** Can Gust swap a running container for a new one behind Traefik
without a single failed request, for apps that do nothing special on shutdown?

**Setup.** Local dev stack (`infra/compose.dev.yml`), demo app
(`infra/demo-app`) that exits immediately on SIGTERM, four clients hitting
`hello.localhost` in a loop. Steps: v1 → v2, a broken v3 that never gets
healthy, rollback to v1. Run with `pnpm spike:bluegreen`.

**First attempt: Traefik Docker provider, routing from container labels.**
New and old container share a Traefik service name; Docker health check gates
the new one. Result: **308 failed out of 158 115** (304 × 502, 4 connection
errors). Traefik learns that the old container stopped from a Docker event,
with a delay, and keeps sending requests to a process that is already gone.

**Second attempt: engine-driven routing (Traefik HTTP provider).** Traefik
polls `GET /internal/traefik` on the engine every second. The engine builds
the config from running containers' `gust.*` labels and leaves out
containers that are not healthy or are draining. A deploy takes the old
container out of the config, waits until Traefik's API confirms, waits 2 s
for in-flight requests, and only then sends SIGTERM.
Result: **0 failed out of 159 896**, again **0 out of 163 251** on a rerun.

**Decision.** Routing comes from the engine, not from Docker labels. As a
bonus Traefik no longer needs any Docker access; only the engine talks to the
socket proxy. The broken v3 failed after its health timeout, was removed, and
v2 kept serving throughout.

**Timings on a MacBook (Docker Desktop):** about 3 s to healthy, 6.4 s from
start of deploy to live including the 2 s drain; a rollback with the image on
the server takes the same 6.4 s.

## Still open

2. GitHub OIDC token verification (JWKS, `aud`, `repository`, `ref`).
3. Zot: robot accounts per project, retention and GC while running.
4. Wildcard certificate over DNS-01 with a Cloudflare token.
5. Socket proxy: confirm the allowed sections cover pull, create, start,
   logs, events and stats in production (they do in dev).
