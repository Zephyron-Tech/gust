import 'server-only';

// Reads repositories from GitHub's public API for the import flow. The web
// container holds no GitHub App key, and the app only sees public
// repositories anyway. Without a token GitHub allows 60 requests an hour, so
// answers are cached and revalidated with ETags (a 304 does not count).
// File contents come from raw.githubusercontent.com, which has no such limit.
import { allowedOwners, ownerAllowed, readDockerfile, usesGustAction } from './github-repo-logic';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

type Cached = { at: number; etag: string | null; body: unknown };
const g = globalThis as unknown as { gustGithubCache?: Map<string, Cached> };
if (!g.gustGithubCache) g.gustGithubCache = new Map();
const cache = g.gustGithubCache;

async function api<T>(path: string, maxAgeMs: number, fresh = false): Promise<T> {
  const hit = cache.get(path);
  if (hit && !fresh && Date.now() - hit.at < maxAgeMs) return hit.body as T;
  const token = process.env.GITHUB_TOKEN?.trim();
  const res = await fetch(`${API}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'gust',
      ...(hit?.etag && { 'if-none-match': hit.etag }),
      ...(token && { authorization: `Bearer ${token}` }),
    },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  }).catch(() => null);
  if (!res) throw new GithubError('GitHub did not answer. Try again in a moment.');
  if (res.status === 304 && hit) {
    cache.set(path, { ...hit, at: Date.now() });
    return hit.body as T;
  }
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
    const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60_000)) : 60;
    throw new GithubError(`GitHub's hourly limit for Gust is used up. It resets in about ${mins} min.`, 503);
  }
  if (res.status === 404) throw new GithubError('Not found on GitHub, or the repository is private.', 404);
  if (!res.ok) throw new GithubError(`GitHub answered ${res.status}.`);
  const body = (await res.json()) as T;
  cache.set(path, { at: Date.now(), etag: res.headers.get('etag'), body });
  return body;
}

async function raw(repo: string, ref: string, path: string): Promise<string | null> {
  const res = await fetch(`${RAW}/${repo}/${encodeURIComponent(ref)}/${path}`, {
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  }).catch(() => null);
  return res?.ok ? res.text() : null;
}

type GhRepo = {
  full_name: string;
  name: string;
  description: string | null;
  default_branch: string;
  pushed_at: string | null;
  language: string | null;
  archived: boolean;
  private: boolean;
  html_url: string;
};

export type RepoSummary = {
  fullName: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  pushedAt: string | null;
  language: string | null;
  url: string;
};

const summary = (r: GhRepo): RepoSummary => ({
  fullName: r.full_name,
  name: r.name,
  description: r.description,
  defaultBranch: r.default_branch,
  pushedAt: r.pushed_at,
  language: r.language,
  url: r.html_url,
});

/** Public, not archived repositories of the allowed owners, most recently pushed first. */
export async function listRepos(fresh = false): Promise<RepoSummary[]> {
  const lists = await Promise.all(
    allowedOwners().map((owner) =>
      api<GhRepo[]>(`/orgs/${encodeURIComponent(owner)}/repos?type=public&sort=pushed&per_page=100`, 5 * 60_000, fresh),
    ),
  );
  return lists
    .flat()
    .filter((r) => !r.archived && !r.private)
    .map(summary)
    .sort((a, b) => (b.pushedAt ?? '').localeCompare(a.pushedAt ?? ''));
}

export type RepoDetail = RepoSummary & {
  branches: string[];
  dockerfile: { found: boolean; port: number | null; healthPath: string | null };
  /** Path of a workflow that already uses the Gust deploy action, or null. */
  workflow: string | null;
};

/** One repository with what the import needs: branches, Dockerfile hints and an existing Gust workflow. */
export async function repoDetail(fullName: string, fresh = false): Promise<RepoDetail> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName) || !ownerAllowed(fullName))
    throw new GithubError('Gust only deploys repositories of its own organisation.', 403);
  const repo = await api<GhRepo>(`/repos/${fullName}`, 60_000, fresh);
  if (repo.private) throw new GithubError('This repository is private. Gust can import public repositories only.', 403);
  const ref = repo.default_branch;
  const [branches, dockerText, workflows] = await Promise.all([
    api<{ name: string }[]>(`/repos/${fullName}/branches?per_page=100`, 60_000, fresh),
    raw(fullName, ref, 'Dockerfile'),
    api<{ name: string; path: string; type: string }[]>(
      `/repos/${fullName}/contents/.github/workflows?ref=${encodeURIComponent(ref)}`,
      60_000,
      fresh,
    ).catch((e) => (e instanceof GithubError && e.status === 404 ? [] : Promise.reject(e))),
  ]);

  let workflow: string | null = null;
  for (const f of workflows.filter((w) => w.type === 'file' && /\.ya?ml$/.test(w.name))) {
    const text = await raw(fullName, ref, f.path);
    if (text && usesGustAction(text)) {
      workflow = f.path;
      break;
    }
  }

  const names = branches.map((b) => b.name);
  return {
    ...summary(repo),
    // The default branch first, the rest by name.
    branches: [ref, ...names.filter((n) => n !== ref).sort()],
    dockerfile: dockerText === null ? { found: false, port: null, healthPath: null } : { found: true, ...readDockerfile(dockerText) },
    workflow,
  };
}
