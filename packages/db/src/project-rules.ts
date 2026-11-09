// Rules for adding a project, shared by `gust project add` and the New project form.
// Pure functions only: no database, so the web app can import this file too.

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const BRANCH = /^[A-Za-z0-9._/-]{1,100}$/;

export type NewProject = {
  slug: string;
  repo: string;
  branch: string;
  /** A custom production domain; null means the automatic <slug>.<GUST_DOMAIN> host. */
  domain: string | null;
  previewBranches: string[];
  service: string;
  port: number;
  healthPath: string | null;
  memoryMb: number;
  cpu: number;
};

export type ValidationResult = { ok: true; value: NewProject } | { ok: false; errors: Record<string, string> };

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** Checks the form fields the way `gust project add` checks its flags. Errors are keyed by field name. */
export function validateNewProject(raw: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};

  const slug = text(raw.slug).toLowerCase();
  if (!SLUG.test(slug)) errors.slug = 'Use 1–40 lowercase letters, digits and dashes';

  const repo = text(raw.repo);
  if (!REPO.test(repo)) errors.repo = 'Use owner/name, e.g. Zephyron-Tech/smart-targets-core';

  const branch = text(raw.branch) || 'main';
  if (!BRANCH.test(branch)) errors.branch = 'Branch name is not valid';

  const domain = text(raw.domain).toLowerCase();
  if (domain && !DOMAIN.test(domain)) errors.domain = 'Enter a domain such as app.example.com, or leave it empty';

  const previewRaw = Array.isArray(raw.previewBranches) ? raw.previewBranches.map(text) : text(raw.previewBranches).split(',');
  const previews = validatePreviewBranches(previewRaw, branch);
  if (!previews.ok) errors.previewBranches = previews.error;

  const service = text(raw.service) || 'web';
  if (!SLUG.test(service)) errors.service = 'Use 1–40 lowercase letters, digits and dashes';

  const port = Number(text(raw.port));
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = 'Port must be a whole number from 1 to 65535';

  const health = text(raw.healthPath);
  if (health && (!health.startsWith('/') || health.length > 200)) errors.healthPath = 'Health path must start with /';

  const memory = text(raw.memoryMb) === '' ? 512 : Number(text(raw.memoryMb));
  if (!Number.isInteger(memory) || memory < 64 || memory > 65536) errors.memoryMb = 'Memory must be from 64 to 65536 MB';

  const cpu = text(raw.cpu) === '' ? 1 : Number(text(raw.cpu));
  if (!(cpu > 0 && cpu <= 64)) errors.cpu = 'CPU must be a number above 0 and at most 64';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      slug,
      repo,
      branch,
      domain: domain || null,
      previewBranches: previews.ok ? previews.value : [],
      service,
      port,
      healthPath: health || null,
      memoryMb: memory,
      cpu,
    },
  };
}

export const MAX_PREVIEW_BRANCHES = 10;

/**
 * Preview branches of a project: each must be a valid branch name, unique, not the
 * production branch, and at most MAX_PREVIEW_BRANCHES. Returns the cleaned list or the first problem.
 */
export function validatePreviewBranches(raw: string[], production: string): { ok: true; value: string[] } | { ok: false; error: string } {
  const list = raw.map((b) => b.trim()).filter(Boolean);
  if (list.length > MAX_PREVIEW_BRANCHES) return { ok: false, error: `At most ${MAX_PREVIEW_BRANCHES} preview branches` };
  for (const b of list) {
    if (!BRANCH.test(b)) return { ok: false, error: `"${b}" is not a valid branch name` };
    if (b === production) return { ok: false, error: `"${b}" is the production branch` };
  }
  if (new Set(list).size !== list.length) return { ok: false, error: 'A branch is listed twice' };
  return { ok: true, value: list };
}
