'use client';

import type { QueryResult } from '@gust/db/project-db';
import { Play, Warning } from '@phosphor-icons/react/ssr';
import { useState } from 'react';
import { ResultGrid } from '@/components/ResultGrid';
import { btn, Panel } from '@/components/ui';

/**
 * One SQL box for a Postgres database. It runs read only unless an admin switches "Allow changes" on;
 * then it runs as written and commits. Nothing is kept: not the text, not the result.
 */
export function QueryConsole({ slug, name, admin }: { slug: string; name: string; admin: boolean }) {
  const [sql, setSql] = useState('select now();');
  const [write, setWrite] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (running || sql.trim() === '') return;
    setRunning(true);
    setError(null);
    const res = await fetch(`/api/storage/${slug}/${name}/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sql, write }),
    }).catch(() => null);
    setRunning(false);
    const body = (await res?.json().catch(() => null)) as (QueryResult & { error?: string }) | null;
    if (!res?.ok || !body) {
      setResult(null);
      return setError(body?.error ?? 'Could not reach Gust. Nothing was run. Try again.');
    }
    setResult(body);
  }

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void run();
            }
          }}
          rows={8}
          spellCheck={false}
          aria-label="SQL"
          className="w-full resize-y rounded-[10px] border border-line bg-bg p-3 font-mono text-[13.5px] leading-relaxed outline-none transition-colors focus:border-accent"
        />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button type="button" className={btn.primary} disabled={running || sql.trim() === ''} onClick={() => void run()}>
            <Play weight="fill" /> {running ? 'Running…' : 'Run'}
          </button>
          <span className="text-[13px] text-fg-3">Cmd+Enter</span>
          {admin && (
            <label className="ml-auto flex items-center gap-2 text-[14px] text-fg-2">
              <input
                type="checkbox"
                checked={write}
                onChange={(e) => setWrite(e.target.checked)}
                className="size-4 accent-[var(--g-accent)]"
              />
              Allow changes
            </label>
          )}
        </div>
        {write ? (
          <p className="mt-3 flex items-start gap-2 text-[13.5px] text-warn">
            <Warning size={16} className="mt-0.5 shrink-0" aria-hidden />
            Changes are committed at once and cannot be undone. Take a backup first if the data matters.
          </p>
        ) : (
          <p className="mt-3 text-[13px] text-fg-3">
            {admin ? 'Read only: Postgres refuses anything that changes data.' : 'Read only. Only admins can change data.'}
          </p>
        )}
      </Panel>

      {error && (
        <p role="alert" className="rounded-xl border border-err/30 bg-err/10 p-3 font-mono text-[13px] whitespace-pre-wrap text-err">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-2">
          <p className="text-[13px] text-fg-3">
            {result.command} · {result.rowCount.toLocaleString('en-GB')} {result.rowCount === 1 ? 'row' : 'rows'} · {result.ms} ms
            {result.truncated && ' · showing the first 500'}
          </p>
          {result.grid.columns.length > 0 ? (
            <ResultGrid columns={result.grid.columns} rows={result.grid.rows} className="max-h-[520px]" />
          ) : (
            <Panel className="px-5 py-4 text-[14px] text-fg-2">Done. The statement returns no rows.</Panel>
          )}
        </div>
      )}
    </div>
  );
}
