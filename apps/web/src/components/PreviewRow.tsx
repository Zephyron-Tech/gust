import { ArrowSquareOut } from '@phosphor-icons/react/ssr';

import { EnvBadge } from '@/components/EnvBadge';
import { cx } from '@/components/ui';

export type PreviewRowData = {
  branch: string;
  host: string | null;
  live: boolean;
  pr?: { number: number; title: string; author: string };
  commit?: { sha: string | null; message: string | null; author: string } | null;
};

/** One preview on the Domains page: its host, where it came from, its environment and whether it runs. */
export function PreviewRow({ p, first }: { p: PreviewRowData; first: boolean }) {
  return (
    <div
      className={cx(
        'grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_100px] sm:items-center sm:gap-4',
        !first && 'border-t border-line',
      )}
    >
      {!p.host ? (
        <span className="truncate text-[14px] text-fg-3">Host appears once GUST_DOMAIN is set</span>
      ) : p.live ? (
        <a
          href={`https://${p.host}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1.5 truncate text-[15px] font-medium hover:text-accent"
        >
          {p.host} <ArrowSquareOut size={14} className="shrink-0 text-fg-3" />
        </a>
      ) : (
        <span className="truncate text-[15px] text-fg-2">{p.host}</span>
      )}
      <div className="min-w-0 text-[13.5px] sm:text-center">
        {p.pr ? (
          <>
            <div className="truncate text-fg-2">
              PR #{p.pr.number} · {p.pr.title}
            </div>
            <div className="truncate text-fg-3">
              from {p.pr.author} · branch {p.branch}
            </div>
          </>
        ) : p.commit ? (
          <>
            <div className="truncate text-fg-2">
              from branch <span className="font-mono text-[13px]">{p.branch}</span>
              {p.commit.sha && <span className="font-mono text-[13px] text-fg-3"> · {p.commit.sha.slice(0, 7)}</span>}
            </div>
            <div className="truncate text-fg-3">
              {p.commit.message ?? 'no commit message'} · {p.commit.author}
            </div>
          </>
        ) : (
          <div className="truncate text-fg-3">from branch {p.branch}</div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 sm:contents">
        <div className="flex sm:justify-center">
          <EnvBadge env={{ kind: 'preview', branch: p.branch }} />
        </div>
        <span className={cx('text-[13.5px] sm:text-right', p.live ? 'text-fg-2' : 'text-fg-3')}>
          {p.live ? 'Deployed' : 'No deploy yet'}
        </span>
      </div>
    </div>
  );
}
