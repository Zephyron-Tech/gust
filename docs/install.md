# Installing Gust on a server

Gust runs as one Docker Compose stack in `/opt/gust` on a single VPS:
Traefik (HTTPS with Let's Encrypt), the socket proxy, Postgres, the Zot
registry, and the Gust image in four roles (migrate, engine, web, worker).
`infra/prod/install.sh` sets it all up; the `gust` command runs it afterwards.

## Before you start

- **Server:** Debian 12/13 or Ubuntu 24.04, **x86-64** (the image is built for
  `linux/amd64`), 4 GB RAM or more, a fresh install with SSH access as root
  or a sudo user.
- **DNS:** A records for `gust.zephyron.tech` and `registry.gust.zephyron.tech`
  pointing at the server. In Cloudflare set them to **DNS only** (grey cloud),
  so Let's Encrypt and large registry uploads reach the server directly.
- **Image access:** a GitHub personal access token (classic) with only
  `read:packages`, from someone in Zephyron-Tech. The image is
  `ghcr.io/zephyron-tech/gust:latest`, published by `.github/workflows/image.yml`
  on every push to `main`.
- **Optional, can be added later by running the installer again:**
  the Authentik client ID and secret (`docs/authentik.md`) and the GitHub App
  ID and private key (`docs/github.md`).

## Install

Copy the installer to the server and run it:

```bash
scp infra/prod/install.sh root@<server>:/root/
ssh root@<server> 'bash /root/install.sh'
```

It asks for the domains, an e-mail for Let's Encrypt, the GitHub token, and
the optional Authentik and GitHub App values (the App key as a path to the
`.pem` on the server). Then it:

1. installs Docker, log rotation, unattended upgrades and a firewall that lets
   in only SSH, HTTP and HTTPS;
2. writes `/opt/gust/.env` with new random secrets (database, sessions,
   encryption key, engine token, registry accounts, break-glass password);
3. takes `compose.yml`, the Traefik and Zot config and the `gust` command out
   of the image;
4. creates the registry accounts `ci` (push, for GitHub Actions) and `gust`
   (read only, for pulls on the server);
5. starts the stack, runs the migrations and creates the break-glass admin;
6. installs `/usr/local/bin/gust` and a nightly backup at 03:15.

Running it again keeps every secret already in `.env` and only changes what
you answer differently, so it is also how Authentik or the GitHub App are
added later.

## After the install

```bash
gust registry      # the ci account: put it into GitHub org secrets
                   # GUST_REGISTRY_USERNAME and GUST_REGISTRY_PASSWORD
gust project add smart-targets --repo Zephyron-Tech/smart-targets-core \
  --service api --port 3000 --domain api.smarttargets.cz --health /health
```

Then point the app's domain at the server, add the repository to the
**Zephyron Gust** GitHub App installation and add the deploy workflow from
`docs/github.md`. The next push to the production branch deploys it with
HTTPS.

The break-glass password is `BREAK_GLASS_PASSWORD` in `/opt/gust/.env`; keep
a copy in the password manager.

## The gust command

| Command                                                             | What it does                                                                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `gust status`                                                       | Containers and their state.                                                                         |
| `gust logs [service]`                                               | Follows logs: `web`, `engine`, `worker`, `traefik`, `zot`, `postgres`.                              |
| `gust update`                                                       | Pulls the latest image, refreshes the config files, restarts what changed. Migrations run on start. |
| `gust restart [service]`                                            | Restarts everything or one service.                                                                 |
| `gust project list`                                                 | Projects and services.                                                                              |
| `gust project add <slug> --repo … --service … --port … --domain …`  | New project with its first service. `--branch`, `--health`, `--memory`, `--cpu` are optional.       |
| `gust project service <slug> <service> --port … --domain a.cz,b.cz` | Adds a service or changes one.                                                                      |
| `gust project set <slug> --repo … --branch … --domain …`            | Changes a project.                                                                                  |
| `gust break-glass`                                                  | Creates or resets the break-glass admin from `.env`.                                                |
| `gust registry`                                                     | Shows the push account for GitHub.                                                                  |
| `gust backup`                                                       | Dumps the database into `/opt/gust/backups` (kept 14 days).                                         |
| `gust restore <file>`                                               | Replaces the database with a dump, after asking.                                                    |

## What runs where

| Service      | Networks          | Notes                                                                                                                                                |
| ------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| traefik      | edge, control     | Ports 80 and 443. HTTP redirects to HTTPS. Routes for apps come from the engine, for Gust and the registry from `traefik/dynamic.yml`.               |
| socket-proxy | internal          | The only container with the Docker socket.                                                                                                           |
| postgres     | internal          | Volume `gust_postgres`.                                                                                                                              |
| zot          | edge, internal    | `registry.gust.zephyron.tech` through Traefik; `127.0.0.1:5050` for pulls by the Docker daemon on the host. Keeps the 20 newest tags per repository. |
| migrate      | internal          | Runs the migrations and exits; web and worker wait for it.                                                                                           |
| engine       | internal, control | Deploys through the socket proxy, gives Traefik its config.                                                                                          |
| web          | edge, internal    | The UI and API on `gust.zephyron.tech`.                                                                                                              |
| worker       | internal          | Runs deploy jobs, restores lost containers, writes commit statuses.                                                                                  |

Apps deployed through Gust join `gust_edge` only.

## Not covered yet

- Monitoring and alerts (the Server page still shows sample data).
- Off-server copies of the backups and of the registry volume.
- Per-project registry accounts; for now every repository pushes as `ci`.
- SSH hardening (keys only, no root login) is left to whoever sets up the
  server.

## Trying the installer locally

The production stack runs on a Mac with plain HTTP on `*.localhost`. Build
the image (`docker build -t gust:local .`), stop the dev stack
(`pnpm infra:down`), then run the installer with `GUST_SKIP_SYSTEM=1
GUST_IMAGE=gust:local GUST_DIR=<folder>`, the answers as environment
variables, and a `compose.local.yml` override in that folder that turns off
the HTTPS entrypoint and the certificate resolver (set
`COMPOSE_FILE=compose.yml:compose.local.yml` and
`GUST_URL=http://gust.localhost`).
