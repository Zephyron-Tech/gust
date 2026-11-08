#!/usr/bin/env bash
# Asks Gust to deploy an image that is already in the registry, then waits
# until the deploy is live or failed. Used by action.yml; runs on its own too
# (local testing) when GUST_TOKEN holds an OIDC token.
#
# Env: GUST_URL, GUST_SERVICE, GUST_TAG, GUST_MESSAGE (optional),
#      GUST_TOKEN (optional: otherwise fetched from GitHub with GUST_AUDIENCE),
#      GUST_WAIT (true|false), GUST_TIMEOUT (seconds)
set -euo pipefail

: "${GUST_URL:?GUST_URL is required}" "${GUST_SERVICE:?GUST_SERVICE is required}" "${GUST_TAG:?GUST_TAG is required}"
GUST_URL="${GUST_URL%/}"

token() {
  if [[ -n "${GUST_TOKEN:-}" ]]; then printf '%s' "$GUST_TOKEN"; return; fi
  if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]]; then
    echo "::error::No OIDC token. Give the job 'permissions: id-token: write'." >&2
    exit 1
  fi
  curl -fsS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
    "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=${GUST_AUDIENCE:-gust.zephyron.tech}" | jq -r .value
}

# GitHub tokens are short-lived, so each call gets a fresh one.
body=$(jq -nc --arg service "$GUST_SERVICE" --arg tag "$GUST_TAG" --arg message "${GUST_MESSAGE:-}" \
  '{service: $service, tag: $tag} + (if $message == "" then {} else {message: $message} end)')

for attempt in 1 2 3 4 5 6; do
  res=$(curl -sS -w '\n%{http_code}' -X POST "$GUST_URL/api/deploy" \
    -H "Authorization: Bearer $(token)" -H 'content-type: application/json' -d "$body")
  code=${res##*$'\n'}
  json=${res%$'\n'*}
  # 409 while another deploy of this service runs: wait for it.
  if [[ "$code" == 409 ]] && jq -e '.error | test("already running")' <<<"$json" >/dev/null 2>&1; then
    echo "Another deploy is running, retrying in 10 s ($attempt/6)"
    sleep 10
    continue
  fi
  break
done

if [[ "$code" != 202 ]]; then
  echo "::error::Gust refused the deploy ($code): $(jq -r '.error // .' <<<"$json")"
  exit 1
fi

id=$(jq -r .id <<<"$json")
url=$(jq -r .url <<<"$json")
echo "Deploy $id started: $url"
[[ -n "${GITHUB_OUTPUT:-}" ]] && { echo "deployment-id=$id"; echo "url=$url"; } >>"$GITHUB_OUTPUT"
[[ "${GUST_WAIT:-true}" == true ]] || exit 0

deadline=$((SECONDS + ${GUST_TIMEOUT:-600}))
last=""
while ((SECONDS < deadline)); do
  status=$(curl -fsS -H "Authorization: Bearer $(token)" "$GUST_URL/api/deploy/$id")
  state=$(jq -r .state <<<"$status")
  [[ "$state" != "$last" ]] && echo "State: $state" && last=$state
  case "$state" in
    live) echo "Live: $url"; exit 0 ;;
    failed | cancelled)
      echo "::error::Deploy $state: $(jq -r '.error // "see Gust"' <<<"$status") ($url)"
      exit 1 ;;
  esac
  sleep 3
done
echo "::error::Gave up waiting after ${GUST_TIMEOUT:-600} s; the deploy may still finish: $url"
exit 1
