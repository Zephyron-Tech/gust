'use client';

import { ArrowClockwise, GitBranch, MagnifyingGlass } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Ago } from './Ago';
import { btn, cx, Panel } from './ui';

type Repo = {
  fullName: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  pushedAt: string | null;
  language: string | null;
  url: string;
  imported: { slug: string; service: string | null } | null;
};

const field = 'h-10 w-full rounded-[10px] border border-line bg-bg px-3 text-[14.5px] outline-none transition-colors focus:border-accent';

/** Step 1 of a new project: pick a repository Gust can see. */
export function ImportRepoList({ owners }: { owners: string[] }) {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [manual, setManual] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/github/repos${fresh ? '?fresh=1' : ''}`).catch(() => null);
    const body = (await res?.json().catch(() => null)) as Repo[] | { error?: string } | null;
    setLoading(false);
    if (!res?.ok || !Array.isArray(body)) {
      setError((body && !Array.isArray(body) && body.error) || 'Could not load repositories from GitHub.');
      return;
    }
    setRepos(body);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (repos ?? []).filter(
      (r) => !needle || r.fullName.toLowerCase().includes(needle) || r.description?.toLowerCase().includes(needle),
    );
  }, [repos, q]);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <label className="relative flex-1">
          <span className="sr-only">Search repositories</span>
          <MagnifyingGlass size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${owners.join(', ')}…`}
            className={cx(field, 'pl-9')}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="button" onClick={() => load(true)} disabled={loading} className={btn.secondary} aria-label="Reload from GitHub">
          <ArrowClockwise className={loading ? 'animate-spin' : undefined} />
        </button>
      </div>

      <Panel className="overflow-hidden">
        {error && (
          <div className="space-y-1 px-5 py-6 text-[14.5px]">
            <p className="text-err">{error}</p>
            <p className="text-fg-3">You can still enter the repository by hand below.</p>
          </div>
        )}
        {!error && repos === null && <p className="px-5 py-10 text-center text-fg-3">Loading repositories from GitHub…</p>}
        {!error && repos !== null && list.length === 0 && (
          <p className="px-5 py-10 text-center text-fg-3">{q ? 'No repository matches.' : 'No public repositories found.'}</p>
        )}
        {list.map((r, i) => (
          <div
            key={r.fullName}
            className={cx('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4', i > 0 && 'border-t border-line')}
          >
            <div className="min-w-0">
              <p className="flex items-baseline gap-2">
                <span className="truncate text-[15px] font-medium">{r.name}</span>
                {r.pushedAt && (
                  <span className="shrink-0 text-[13px] text-fg-3">
                    · <Ago iso={r.pushedAt} />
                  </span>
                )}
              </p>
              <p className="flex items-center gap-2 truncate text-[13px] text-fg-3">
                <span className="inline-flex items-center gap-1">
                  <GitBranch size={13} /> {r.defaultBranch}
                </span>
                {r.language && <span>· {r.language}</span>}
                {r.description && <span className="truncate">· {r.description}</span>}
              </p>
            </div>
            {r.imported ? (
              <Link
                href={`/projects/${r.imported.slug}${r.imported.service ? `/${r.imported.service}/deployments` : ''}`}
                className={btn.ghost}
              >
                Open {r.imported.slug}
              </Link>
            ) : (
              <Link href={`/projects/new/${r.fullName}`} className={btn.primary}>
                Import
              </Link>
            )}
          </div>
        ))}
      </Panel>

      <form
        className="flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const name = manual
            .trim()
            .replace(/^https?:\/\/github\.com\//, '')
            .replace(/\.git$/, '')
            .replace(/\/$/, '');
          if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name)) router.push(`/projects/new/${name}`);
        }}
      >
        <label className="flex-1 space-y-1">
          <span className="text-[13px] text-fg-3">Not in the list? Enter a public repository</span>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={`${owners[0] ?? 'owner'}/repository`}
            className={cx(field, 'font-mono text-[13.5px]')}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" className={btn.secondary}>
          Continue
        </button>
      </form>
    </div>
  );
}
