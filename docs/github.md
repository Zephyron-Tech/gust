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
   (default `main`). Other branches get 403; previews come in M4.
5. The token's `jti` was not used for a deploy before (`github_token_uses`), so
   a captured token cannot start a second deploy.

The commit, author and run id come from the token, never from the body. The
deploy is written to the audit log as `deploy.push` with actor
`github:<repository>`.

`GET /api/deploy/:id` with a token from the same repository returns
`{ state, error, url }`; tokens from other repositories get 404.

## A project's workflow

The project must have `github_repo` set (for now in the database:
`update projects set github_repo = 'Zephyron-Tech/smart-targets-core' where slug = 'smart-targets'`).

```yaml
# .github/workflows/deploy.yml in the project's repository
name: Deploy
on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write # the OIDC token for Gust

concurrency:
  group: gust-api
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
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

- Webhook: off for now (M4 turns it on for pull-request previews).
- Repository permissions: **Commit statuses: Read and write**, Metadata: Read.
  Nothing else.
- Installed on selected repositories; add each repository when it moves to
  Gust (organisation settings → GitHub Apps → Zephyron Gust → Configure).

The private key lives in the shared password manager. Put it in
`GITHUB_APP_PRIVATE_KEY` with newlines written as `\n`:

```bash
printf 'GITHUB_APP_PRIVATE_KEY="%s"\n' "$(awk '{printf "%s\\n", $0}' path/to/key.pem)" >> apps/worker/.env
```

## Registry access

The action logs in to the registry with a robot account. Locally Zot runs
without authentication on `127.0.0.1:5050`. Robot accounts per project
(`RegistryCredential` in the spec) come with the VPS setup, when the registry
becomes reachable from GitHub.

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
