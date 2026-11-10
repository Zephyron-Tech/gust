// The projects this browser opened most recently, newest first. Kept per
// browser: it is a convenience for the sidebar, not a record anyone else reads.

const KEY = 'gust.recent-projects';
const KEEP = 8;

export function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, KEEP) : [];
  } catch {
    return [];
  }
}

/** Puts a project first in the list and returns the new order. Storage may be blocked; the order then lasts only this visit. */
export function rememberProject(slug: string): string[] {
  const next = [slug, ...readRecent().filter((s) => s !== slug)].slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not saved.
  }
  return next;
}
