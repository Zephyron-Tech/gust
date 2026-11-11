// Pure helpers for importing a repository: what its Dockerfile says, whether
// it already has the Gust deploy workflow, and the workflow to add if not.
// No network here, so the tests can run them directly.

/** The GitHub owners Gust deploys for, from GITHUB_ALLOWED_OWNERS. */
export const allowedOwners = (raw = process.env.GITHUB_ALLOWED_OWNERS ?? 'Zephyron-Tech') =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const ownerAllowed = (fullName: string, owners = allowedOwners()) => {
  const owner = fullName.split('/')[0]?.toLowerCase();
  return owners.some((o) => o.toLowerCase() === owner);
};

/** What a Dockerfile tells about the service: the first exposed port and a health path from HEALTHCHECK, if any. */
export function readDockerfile(text: string): { port: number | null; healthPath: string | null } {
  let port: number | null = null;
  let healthPath: string | null = null;
  // Continued lines (ending in \) belong to the instruction above.
  const lines = text.replace(/\\\r?\n/g, ' ').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (port === null) {
      const m = /^EXPOSE\s+(\d{1,5})(?:\/(?:tcp|udp))?\b/i.exec(line);
      const n = m ? Number(m[1]) : NaN;
      if (n >= 1 && n <= 65535) port = n;
    }
    if (healthPath === null && /^HEALTHCHECK\b/i.test(line)) {
      // e.g. CMD wget -qO- http://localhost:3000/healthz || exit 1
      const m = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(\/[^\s"'|;)]*)/.exec(line);
      if (m?.[1]) healthPath = m[1];
    }
  }
  return { port, healthPath };
}

export const DEPLOY_ACTION = 'Zephyron-Tech/gust/.github/actions/deploy';

/** Whether a workflow file uses the Gust deploy action. */
export const usesGustAction = (yaml: string) => yaml.includes(DEPLOY_ACTION);

/** Whether a workflow runs on pull_request, which is what gives a pull request its preview. */
export const hasPullRequestTrigger = (yaml: string) => /(^|[\s[,])pull_request(?=\s*(:|,|\]))/m.test(yaml);

/** A project slug from a repository name: lowercase, dashes, at most 40 characters. */
export const slugFromRepo = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');

/**
 * The deploy workflow for a service: builds on push to the production and preview branches and on pull
 * requests of the repository itself, and hands the image to Gust. A fork's pull request gets no preview.
 */
export function workflowYaml(input: { gustUrl: string; project: string; service: string; branches: string[] }) {
  const branches = input.branches.map((b) => (/^[A-Za-z0-9._/-]+$/.test(b) ? b : JSON.stringify(b))).join(', ');
  return `name: Deploy to Gust
on:
  push:
    branches: [${branches}]
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  id-token: write # the OIDC token Gust checks instead of a deploy secret

concurrency:
  group: gust-\${{ github.ref_name }}
  cancel-in-progress: false

jobs:
  deploy:
    # A fork's pull request gets no OIDC token and no preview.
    if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ${DEPLOY_ACTION}@main
        with:
          gust-url: ${input.gustUrl}
          service: ${input.service}
          image: ${input.project}/${input.service}
          registry-username: \${{ secrets.GUST_REGISTRY_USERNAME }}
          registry-password: \${{ secrets.GUST_REGISTRY_PASSWORD }}
`;
}

/** A GitHub link that opens the editor for a new file with this content, ready to commit. */
export const newFileUrl = (repo: string, branch: string, path: string, content: string) =>
  `https://github.com/${repo}/new/${encodeURIComponent(branch)}?filename=${encodeURIComponent(path)}&value=${encodeURIComponent(content)}`;
