# Deploys from GitHub

A push to a project's production branch builds an image in GitHub Actions,
pushes it to Gust's registry and asks Gust to deploy it. Gust never builds
anything and GitHub holds no deploy secret: the workflow proves who it is with
its GitHub OIDC token.

```
push to main ─▶ Actions: docker build ─▶ push to Zot ─▶ POST /api/deploy (OIDC token)
                                                       │
                Gust: check token ─▶ find service by repository + branch ─▶ queue ─▶ worker ─▶ engine
                                                       │
                Actions polls GET /api/deploy/:id until live or failed; the job ends with the deploy's result
                worker writes the state next to the commit (GitHub App, optional)
```

## What Gust checks

`POST /api/deploy` takes `{ service, tag, message? }` and an
`Authorization: Bearer <GitHub OIDC token>` header.

1. The token is signed by GitHub (`token.actions.githubusercontent.com`, keys
   from its JWKS), not expired, and its `aud` is `GITHUB_OIDC_AUDIENCE`
   (default `gust.zephyron.tech`).
2. `repository_owner` is in `GITHUB_ALLOWED_OWNERS` (default `Zephyron-Tech`).
3. A project has `github_repo` equal to the token's `repository` and a service
   with that name. A token from another repository gets 404.
4. The token's `ref` is `refs/heads/<production_branch>` of that project
   (default `main`), which deploys to production, or `refs/heads/<branch>` of
   the project's `preview_branches`, which deploys a preview. Any other branch
   gets 403.
5. The token's `jti` was not used for a deploy before (`github_token_uses`), so
   a captured token cannot start a second deploy.

The commit, author and run id come from the token, never from the body. The
deploy is written to the audit log as `deploy.push` with actor
`github:<repository>`.

`GET /api/deploy/:id` with a token from the same repository returns
`{ state, error, url }`; tokens from other repositories get 404.

## A project's workflow

**Projects → New project** lists the public repositories of the owners in
`GITHUB_ALLOWED_OWNERS`, read from GitHub's public API (cached; set
`GITHUB_TOKEN` on web if the 60 requests an hour ever run out). Import one,
check the settings Gust filled in from the repository (branches, the port from
the Dockerfile's `EXPOSE`), and create the project. It is served on
`<slug>.<GUST_TEMP_DOMAIN>` (for example `demo.zephyron.tech`) when that variable is set,
otherwise on `<slug>.<GUST_DOMAIN>`; custom domains are added later in the Domains tab.
The setup page that follows shows the workflow below, filled in for the
project, with a button that opens GitHub's editor for the new file. Commit it
there and the next push deploys.

```yaml
# .github/workflows/deploy.yml in the project's repository
name: Deploy
on:
  push:
    branches: [main]
  # Pull requests from this repository get a preview. Forks never do (no token, see the job's if).
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  id-token: write # the OIDC token for Gust

concurrency:
  group: gust-api
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - uses: actions/checkout@v5
      - uses: Zephyron-Tech/gust/.github/actions/deploy@main
        with:
          gust-url: https://gust.zephyron.tech
          service: api
          image: smart-targets/api
          registry-username: ${{ secrets.GUST_REGISTRY_USERNAME }}
          registry-password: ${{ secrets.GUST_REGISTRY_PASSWORD }}
```

The image is tagged with the first 12 characters of the commit. The action
waits for the deploy and fails the job when the deploy fails; `wait: false`
returns as soon as Gust accepted it.

### Dockerfile

The action builds the repository's `Dockerfile` (or the one at `dockerfile:`).
When there is none, it generates one (`.github/actions/deploy/dockerfile.mjs`)
for:

- **Next.js** (`next` in dependencies). With `output: 'standalone'` in
  `next.config` the image runs `.next/standalone`, the smallest option. Without
  it the image runs `next start` with the production dependencies.
- **Node.js** with a `start` script. The image runs `npm`, `pnpm` or `yarn
  start`; the app listens on `PORT` (3000) and `EXPOSE`s it.

The package manager comes from `packageManager`, else from the lockfile.
Installs use the frozen lockfile, the image runs as `node`, and `.env`,
`.env.local`, `.git` and `node_modules` stay out of the build. A committed
`.env.production` is still available at build time. Anything else (other
stacks, Bun, a repository with no `start` script) fails the job with a message
and needs a Dockerfile. The generated file is printed in the job log and is
never committed.

The Gust repository is private. For other repositories to use its action, set
**Settings → Actions → General → Access** to "Accessible from repositories in
the Zephyron-Tech organization".

## Commit status (GitHub App)

The worker writes `gust/<service>` statuses (pending, success, failure, with a
link to the deployment) when `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` are
set in `apps/worker/.env`. Without them it skips this quietly; the workflow's
own check still shows the result.

The app is registered as **Zephyron Gust** (App ID `5670843`, installable
only on Zephyron-Tech) with:

- Webhook: on, `https://gust.zephyron.tech/api/github/webhook`, secret
  `GITHUB_WEBHOOK_SECRET` (the same value as in `/opt/gust/.env`). Subscribed to
  **Pull request** events. Gust keeps each open pull request and removes its preview
  when it closes. Permission **Pull requests: Read** is needed; an organisation owner
  approves the change on GitHub.

## Pull request previews

A pull request in a project's repository gets a preview at `pr-<number>-<project>.<GUST_DOMAIN>`,
built and deployed by the project's workflow on `opened`, `synchronize` and `reopened`. The
preview is removed when the pull request closes. Gust keeps at most 10 pull request previews per
project; the least recently changed one makes room for a new one. Pull requests from forks get no
preview. Branch previews (`previewBranches`) work as before; a branch may not be named `pr-<number>`.

## Branch previews

A project lists its preview branches in the service's **Settings → Branches** (admins),
or with `gust project set <slug> --preview dev` (comma-separated, empty clears them). A push to one deploys a separate copy of
the service on `<branch>-<project>.<GUST_DOMAIN>` (branch name cut to one DNS
label). The wildcard DNS record covers it. When `GUST_WILDCARD_ZONES` lists
`gust.zephyron.tech`, Traefik gets one `*.gust.zephyron.tech` certificate over
DNS-01 (WEDOS); otherwise it asks Let's Encrypt for a certificate per host (HTTP-01). Preview and production never share a
container or route. Env variables are set for **Production + Preview**,
**Production** or **Preview**; one set for a single environment overrides the
shared one with the same key. After a change, the Environment tab offers a
redeploy only for the environments it reaches.
Each push to a branch replaces that branch's previous preview. Previews are not
removed when their branch is deleted yet.

## Automatic domains for a new project

A new project's main branch is served on `<slug>.<GUST_TEMP_DOMAIN>` (for example
`demo.zephyron.tech`) with no DNS step. Zephyron's `*.zephyron.tech` wildcard record
covers it, and the certificate is the shared `*.zephyron.tech` one. Set
`GUST_TEMP_DOMAIN` in `/opt/gust/.env`. Previews stay on `*.gust.zephyron.tech`.
Production domains you add yourself (Domains tab) are separate; a name under a
wildcard zone uses the wildcard certificate, others use HTTP-01.

## Custom domains

Production domains are added in the service's **Domains** tab (admins). Gust
shows the DNS record to add: an `A` record to `GUST_SERVER_IP` for an apex, a
`CNAME` to `GUST_DOMAIN` (or an `A`) for a subdomain. The worker checks DNS every
30 s. Once the name resolves to the server it adds the host to the service,
redeploys the live production image (blue/green, no downtime) and checks that
HTTPS answers; Traefik gets the certificate on the first request. Removing a
domain redeploys the same way. The worker needs `GUST_SERVER_IP` in
`/opt/gust/.env`. Preview hosts are automatic and listed in the same tab.

- Repository permissions: **Commit statuses: Read and write**, **Secrets: Read
  and write** (Gust sets each repository's registry secrets, see below), Metadata:
  Read. Nothing else. Organisation owners approve the new permission on GitHub
  before Gust can write secrets.
- Installed on selected repositories; add each repository when it moves to
  Gust (organisation settings → GitHub Apps → Zephyron Gust → Configure).

The private key lives in the shared password manager. Put it in
`GITHUB_APP_PRIVATE_KEY` with newlines written as `\n`:

```bash
printf 'GITHUB_APP_PRIVATE_KEY="%s"\n' "$(awk '{printf "%s\\n", $0}' path/to/key.pem)" >> apps/worker/.env
```

## Registry access

The action logs in to the registry with the project's own account. Each project
has one account, `ci-<slug>`, which may push only under `<slug>/` (Zot's
`accessControl` in `registry-config.ts`). Gust creates the account when the
project is added, writes its password into the repository's Actions secrets
`GUST_REGISTRY_USERNAME` and `GUST_REGISTRY_PASSWORD` through the GitHub API,
and records the result on the project's setup page (Retry secrets there, or
rotate and revoke from the same card). Passwords are never shown in the UI or
written to logs; only the bcrypt hash is stored.

The Registry page lists the accounts (admins can create, rotate, revoke and
reactivate them there) and each repository's tags. An admin can delete a tag
there; the web does it with the `gust-admin` account, which may read and delete
but never push. Its password, `REGISTRY_ADMIN_PASSWORD`, lives in `.env` and
reaches only the web and worker containers.

The Docker daemon on the host pulls with the read-only `gust` account on
`127.0.0.1:5050`. Zot reads its login file and push rules from the
`registry-auth` volume, which the worker writes; when they change, the engine
restarts Zot.

## Trying it locally

GitHub cannot reach a Gust on your Mac, so the dev setup mints look-alike
tokens with a key on this machine:

```bash
# apps/web/.env.local: GITHUB_OIDC_DEV_JWKS=.dev-oidc/jwks.json (ignored when NODE_ENV=production)
sha=$(git rev-parse HEAD); tag=${sha::12}
docker build --build-arg VERSION=$tag -t localhost:5050/demo/hello:$tag infra/demo-app
docker push localhost:5050/demo/hello:$tag
GUST_URL=http://localhost:3100 GUST_SERVICE=hello GUST_TAG=$tag \
GUST_TOKEN="$(pnpm --silent --filter @gust/web dev:oidc --sha $sha)" \
  bash .github/actions/deploy/deploy.sh
```

`dev:oidc` takes `--repo`, `--ref`, `--sha`, `--actor` and `--audience`, so
the refusals can be tried the same way (`--repo someone/else`,
`--ref refs/heads/feature`).
