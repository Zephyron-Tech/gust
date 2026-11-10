'use client';

import type { Icon } from '@phosphor-icons/react';
import {
  ArrowClockwise,
  ArrowRight,
  ArrowSquareOut,
  CheckCircle,
  DownloadSimple,
  FileCode,
  FileCss,
  FileHtml,
  FileJs,
  FilePy,
  FileRs,
  FileTs,
  FileVue,
  GitBranch,
  GithubLogo,
  MagnifyingGlass,
} from '@phosphor-icons/react/ssr';
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

// The repository's main language as an icon; anything else gets the GitHub mark.
const languageIcon: Record<string, Icon> = {
  TypeScript: FileTs,
  JavaScript: FileJs,
  Python: FilePy,
  Rust: FileRs,
  Vue: FileVue,
  HTML: FileHtml,
  CSS: FileCss,
  SCSS: FileCss,
  Go: FileCode,
  PHP: FileCode,
  Shell: FileCode,
};

function RepoIcon({ language, imported }: { language: string | null; imported: boolean }) {
  const I = (language && languageIcon[language]) || GithubLogo;
  return (
    <span className="relative grid size-10 shrink-0 place-items-center rounded-[10px] border border-line bg-bg-3 text-fg-2">
      <I size={21} aria-hidden />
      {imported && (
        <CheckCircle size={17} weight="fill" aria-hidden className="pop-in absolute -right-1.5 -bottom-1.5 rounded-full bg-bg-2 text-ok" />
      )}
    </span>
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

      {repos !== null && !error && (
        <p className="text-[13.5px] text-fg-3 tabular-nums">
          {list.length} {list.length === 1 ? 'repository' : 'repositories'}
          {q.trim() ? ` of ${repos.length}` : ''} · {repos.filter((r) => r.imported).length} already in Gust
        </p>
      )}

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
        {!error && repos !== null && list.length === 0 && (
          <p className="px-5 py-10 text-center text-fg-3">{q ? 'No repository matches.' : 'No public repositories found.'}</p>
        )}
        {list.map((r, i) => (
          <div
            key={r.fullName}
            className={cx(
              'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-bg-3/40',
              i > 0 && 'border-t border-line',
            )}
          >
            <RepoIcon language={r.language} imported={!!r.imported} />
            <div className="min-w-0">
              <p className="flex items-baseline gap-2">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group/name inline-flex min-w-0 items-baseline gap-1 text-[15px] font-medium hover:text-accent"
                >
                  <span className="truncate">{r.name}</span>
                  <ArrowSquareOut
                    size={13}
                    aria-label="Open on GitHub"
                    className="shrink-0 self-center text-fg-3 opacity-0 transition-opacity duration-150 group-hover/name:opacity-100 group-focus-visible/name:opacity-100"
                  />
                </a>
                {r.imported && (
                  <span className="shrink-0 rounded-full bg-ok/14 px-2 py-0.5 text-[12px] leading-none font-medium text-ok">Imported</span>
                )}
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
                className={cx(btn.secondary, 'group/open')}
              >
                Open {r.imported.slug}
                <ArrowRight className="transition-[translate] duration-200 ease-[var(--ease-out)] group-hover/open:translate-x-0.5" />
              </Link>
            ) : (
              <Link href={`/projects/new/${r.fullName}`} className={btn.primary}>
                <DownloadSimple weight="bold" /> Import
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
