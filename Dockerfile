# One image for all of Gust: the web UI, the engine, the worker, migrations
# and the `gust` admin commands. The first argument picks the role, see
# infra/prod/entrypoint.sh. CI publishes it to ghcr.io/zephyron-tech/gust.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /gust
COPY . .
RUN pnpm install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @gust/web build

FROM node:24-alpine
# postgresql17-client: pg_dump and pg_restore for the worker's per-database backups; must match postgres:17 (v3.22 and v3.23 ship it).
RUN apk add --no-cache tini postgresql17-client && corepack enable
WORKDIR /gust
COPY --from=build /gust /gust
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
ARG GUST_VERSION=dev
ENV GUST_VERSION=$GUST_VERSION
RUN chmod +x infra/prod/entrypoint.sh
ENTRYPOINT ["/sbin/tini", "--", "/gust/infra/prod/entrypoint.sh"]
CMD ["web"]
