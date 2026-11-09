// Rules for adding a project, shared by `gust project add` and the New project form.
// Pure functions only: no database, so the web app can import this file too.

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,100}$/;

export type NewProject = {
  slug: string;
  repo: string;
  branch: string;
  domain: string;
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
  if (!DOMAIN.test(domain)) errors.domain = 'Enter a domain such as app.example.com';

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
    value: { slug, repo, branch, domain, service, port, healthPath: health || null, memoryMb: memory, cpu },
  };
}
