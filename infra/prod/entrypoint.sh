#!/bin/sh
# Entry point of the Gust image. The first argument is the role:
#   web | engine | worker | migrate | break-glass | project <args>
set -e
role="${1:-web}"
[ $# -gt 0 ] && shift
tsx=node_modules/.bin/tsx

case "$role" in
  web)
    cd /gust/apps/web
    exec node_modules/.bin/next start --hostname 0.0.0.0 --port "${PORT:-3100}"
    ;;
  engine)
    cd /gust/apps/engine
    exec "$tsx" src/server.ts
    ;;
  worker)
    cd /gust/apps/worker
    exec "$tsx" src/main.ts
    ;;
  migrate)
    cd /gust/packages/db
    exec "$tsx" src/migrate.ts
    ;;
  break-glass)
    cd /gust/apps/web
    exec "$tsx" scripts/break-glass.ts
    ;;
  project)
    cd /gust/packages/db
    exec "$tsx" src/project-cli.ts "$@"
    ;;
  *)
    echo "unknown role: $role (web, engine, worker, migrate, break-glass, project)" >&2
    exit 64
    ;;
esac
