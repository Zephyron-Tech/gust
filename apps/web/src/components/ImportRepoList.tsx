'use client';

import {
  ArrowClockwise,
  ArrowRight,
  ArrowSquareOut,
  DownloadSimple,
  GitBranch,
  GithubLogo,
  MagnifyingGlass,
} from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { languageLogo } from '@/lib/languages';
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
  frameworks: string[];
  imported: { slug: string; service: string | null } | null;
};

/** The language's colour logo; the GitHub mark where there is none. */
function RepoIcon({ language }: { language: string | null }) {
  const logo = languageLogo(language);
  return (
    // Logos are drawn for a light page: they sit on a light tile, so the dark marks stay visible.
    <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-line bg-fg/95">
      {logo ? (
        // biome-ignore lint/performance/noImgElement: a small static brand logo, sized by its tile
        <img src={logo} alt="" width={22} height={22} loading="lazy" decoding="async" className="size-[22px]" />
      ) : (
        <GithubLogo size={21} aria-hidden className="text-bg" />
      )}
    </span>
  );
}

function RepoRow({ repo, first, action }: { repo: Repo; first: boolean; action: ReactNode }) {
  return (
    <div
      className={cx(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-bg-3/40',
        !first && 'border-t border-line',
      )}
    >
      <RepoIcon language={repo.language} />
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <a
            href={repo.url}
            target="_blank"
            rel="noreferrer"
            className="group/name inline-flex min-w-0 items-baseline gap-1 text-[15px] font-medium hover:text-accent"
          >
            <span className="truncate">{repo.name}</span>
            <ArrowSquareOut
              size={13}
              aria-label="Open on GitHub"
              className="shrink-0 self-center text-fg-3 opacity-0 transition-opacity duration-150 group-hover/name:opacity-100 group-focus-visible/name:opacity-100"
            />
          </a>
        </p>
        <p className="flex items-center gap-2 truncate text-[13px] text-fg-3">
          <span className="inline-flex shrink-0 items-center gap-1">
            <GitBranch size={13} /> {repo.defaultBranch}
          </span>
          {repo.language && <span className="shrink-0">· {repo.language}</span>}
          {repo.pushedAt && (
            <span className="shrink-0">
              · <Ago iso={repo.pushedAt} />
            </span>
          )}
          {repo.description && <span className="truncate">· {repo.description}</span>}
        </p>
        {repo.frameworks.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {repo.frameworks.map((f) => (
              <span key={f} className="rounded-md border border-line bg-bg-3 px-2 py-0.5 text-[12px] leading-none text-fg-2">
                {f}
              </span>
            ))}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function SectionHead({ id, title, count }: { id: string; title: string; count: number }) {
  return (
    <h2 id={id} className="mb-3 flex items-baseline justify-between gap-3 px-1">
      <span className="font-display text-[16px] font-semibold tracking-tight">{title}</span>
      <span className="text-[13px] text-fg-3 tabular-nums">{count}</span>
    </h2>
  );
}

const field = 'h-10 w-full rounded-[10px] border border-line bg-bg px-3 text-[14.5px] outline-none transition-colors focus:border-accent';

/** Step 1 of a new project: pick a repository Gust can see. */
export function ImportRepoList({ owners }: { owners: string[] }) {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
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

  // The search narrows both columns. Repositories already in Gust sit apart, so the ones to import stay first.
  const { available, inGust } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (r: Repo) => !needle || r.fullName.toLowerCase().includes(needle) || r.description?.toLowerCase().includes(needle);
    const all = (repos ?? []).filter(match);
    return { available: all.filter((r) => !r.imported), inGust: all.filter((r) => r.imported) };
  }, [repos, q]);

  const total = repos?.length ?? 0;

  // Keys: "/" finds a repository, Esc clears the search, and the arrows move between the row actions.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || !!t?.isContentEditable;
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === 'Escape' && t === searchRef.current && q) {
        setQ('');
        return;
      }
      const actions = [...document.querySelectorAll<HTMLElement>('[data-row-action]')];
      if (actions.length === 0) return;
      const at = actions.indexOf(t as HTMLElement);
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (at !== -1 || t === searchRef.current)) {
        e.preventDefault();
        const next = t === searchRef.current ? (e.key === 'ArrowDown' ? 0 : actions.length - 1) : at + (e.key === 'ArrowDown' ? 1 : -1);
        actions[Math.min(actions.length - 1, Math.max(0, next))]?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <label className="relative flex-1">
          <span className="sr-only">Search repositories</span>
          <MagnifyingGlass size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${owners.join(', ')}…`}
            className={cx(field, 'pl-9 pr-10')}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md border border-line bg-bg-3 px-1.5 py-0.5 font-mono text-[12px] text-fg-3">
            /
          </kbd>
        </label>
        <button type="button" onClick={() => load(true)} disabled={loading} className={btn.secondary} aria-label="Reload from GitHub">
          <ArrowClockwise className={loading ? 'animate-spin' : undefined} />
        </button>
      </div>

      {repos !== null && !error && (
        <p className="text-[13.5px] text-fg-3 tabular-nums">
          {available.length + inGust.length} of {total} {total === 1 ? 'repository' : 'repositories'}
          {q.trim() ? ' match' : ''}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-6">
        <section aria-labelledby="import-available">
          <SectionHead id="import-available" title="Available to import" count={available.length} />
          <Panel className="overflow-hidden">
            {error && (
              <div className="space-y-1 px-5 py-6 text-[14.5px]">
                <p className="text-err">{error}</p>
                <p className="text-fg-3">You can still enter the repository by hand below.</p>
                <button type="button" onClick={() => load(true)} disabled={loading} className={cx(btn.secondary, 'mt-3')}>
                  <ArrowClockwise className={loading ? 'animate-spin' : undefined} /> Try again
                </button>
              </div>
            )}
            {!error && repos === null && (
              <div role="status" aria-busy="true" aria-label="Loading repositories from GitHub">
                {[62, 44, 70, 52, 38].map((w, i) => (
                  <div key={w} className={cx('flex items-center gap-4 px-5 py-4', i > 0 && 'border-t border-line')}>
                    <span className="skeleton size-10 shrink-0 rounded-[10px]" />
                    <span className="flex-1 space-y-2">
                      <span className="skeleton block h-3.5" style={{ width: `${w * 0.5}%` }} />
                      <span className="skeleton block h-3" style={{ width: `${w}%` }} />
                    </span>
                    <span className="skeleton h-9 w-[92px] rounded-[10px]" />
                  </div>
                ))}
              </div>
            )}
            {!error && repos !== null && available.length === 0 && (
              <p className="px-5 py-10 text-center text-fg-3">
                {q
                  ? 'No repository to import matches.'
                  : total === 0
                    ? 'No public repositories found.'
                    : 'Every repository is already in Gust.'}
              </p>
            )}
            {available.map((r, i) => (
              <RepoRow
                key={r.fullName}
                repo={r}
                first={i === 0}
                action={
                  <Link href={`/projects/new/${r.fullName}`} className={btn.primary} data-row-action>
                    <DownloadSimple weight="bold" /> Import
                  </Link>
                }
              />
            ))}
          </Panel>
        </section>

        {repos !== null && !error && (
          <section aria-labelledby="import-in-gust">
            <SectionHead id="import-in-gust" title="Already in Gust" count={inGust.length} />
            <Panel className="overflow-hidden">
              {inGust.length === 0 && (
                <p className="px-5 py-10 text-center text-fg-3">{q ? 'No imported repository matches.' : 'Nothing imported yet.'}</p>
              )}
              {inGust.map((r, i) =>
                r.imported ? (
                  <RepoRow
                    key={r.fullName}
                    repo={r}
                    first={i === 0}
                    action={
                      <Link
                        href={`/projects/${r.imported.slug}${r.imported.service ? `/${r.imported.service}/deployments` : ''}`}
                        className={cx(btn.secondary, 'group/open')}
                        data-row-action
                      >
                        Open {r.imported.slug}
                        <ArrowRight className="transition-[translate] duration-200 ease-[var(--ease-out)] group-hover/open:translate-x-0.5" />
                      </Link>
                    }
                  />
                ) : null,
              )}
            </Panel>
          </section>
        )}
      </div>

      <form
        className="flex items-end gap-3 lg:max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const name = manual
            .trim()
            .replace(/^https?:\/\/github\.com\//, '')
            .replace(/\.git$/, '')
            .replace(/\/$/, '');
          if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name)) router.push(`/projects/new/${name}`);
          else setManualError('Use owner/name, or paste the GitHub address of the repository.');
        }}
      >
        <label className="flex-1 space-y-1">
          <span className="text-[13px] text-fg-3">Not in the list? Enter a public repository</span>
          <input
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
              setManualError(null);
            }}
            aria-invalid={manualError ? true : undefined}
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
      {manualError && (
        <p role="alert" className="fade-in -mt-2 text-[13.5px] text-err">
          {manualError}
        </p>
      )}
    </div>
  );
}
