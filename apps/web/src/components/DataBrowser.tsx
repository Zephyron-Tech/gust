'use client';

import type { ColumnInfo, Grid, TableInfo } from '@gust/db/project-db';
import { CaretLeft, CaretRight, Table as TableIcon } from '@phosphor-icons/react/ssr';
import { useCallback, useEffect, useState } from 'react';
import { ResultGrid } from '@/components/ResultGrid';
import { btn, cx, Panel } from '@/components/ui';

type Page = { columns: ColumnInfo[]; grid: Grid; hasMore: boolean };

const PAGE_SIZE = 50;

const readError = async (res: Response | null) =>
  ((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not reach Gust. Try again.';

/** Tables of one Postgres database on the left; columns and a page of rows of the chosen one on the right. Read only. */
export function DataBrowser({ slug, name }: { slug: string; name: string }) {
  const base = `/api/storage/${slug}/${name}/tables`;
  const [tables, setTables] = useState<TableInfo[] | null>(null);
  const [table, setTable] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch(base).catch(() => null);
      if (!live) return;
      if (!res?.ok) return setError(await readError(res));
      const body = (await res.json()) as { tables: TableInfo[] };
      setTables(body.tables);
      setTable((t) => t ?? body.tables[0]?.name ?? null);
    })();
    return () => {
      live = false;
    };
  }, [base]);

  const load = useCallback(async () => {
    if (!table) return;
    setError(null);
    const res = await fetch(`${base}/${encodeURIComponent(table)}?page=${page}`).catch(() => null);
    if (!res?.ok) return setError(await readError(res));
    setData((await res.json()) as Page);
  }, [base, table, page]);
  useEffect(() => {
    void load();
  }, [load]);

  if (tables && tables.length === 0)
    return (
      <Panel className="px-6 py-10 text-center">
        <p className="font-medium">No tables yet.</p>
        <p className="mx-auto mt-1 max-w-md text-[14px] text-fg-3">
          The app has not created any, or it keeps them in another schema. Only the public schema is shown.
        </p>
      </Panel>
    );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[240px_1fr]">
      <Panel className="overflow-hidden">
        <ul aria-label="Tables" className="max-h-[560px] overflow-auto py-1.5">
          {(tables ?? []).map((t) => (
            <li key={t.name}>
              <button
                type="button"
                onClick={() => {
                  setTable(t.name);
                  setPage(0);
                  setData(null);
                }}
                aria-current={table === t.name ? 'true' : undefined}
                className={cx(
                  'flex w-full items-center gap-2 px-4 py-2 text-left text-[13.5px] transition-colors duration-150',
                  table === t.name ? 'bg-accent-soft text-fg' : 'text-fg-2 hover:bg-bg-3/60 hover:text-fg',
                )}
              >
                <TableIcon size={15} className="shrink-0 text-fg-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono">{t.name}</span>
                <span className="shrink-0 text-[12px] text-fg-3">
                  {t.kind === 'view' ? 'view' : `~${t.estimate.toLocaleString('en-GB')}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="min-w-0 space-y-3">
        {error && (
          <p role="alert" className="rounded-xl border border-err/30 bg-err/10 p-3 text-[14px] text-err">
            {error}
          </p>
        )}
        {data && table && (
          <>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg-3">
              {data.columns.map((c) => (
                <span key={c.name}>
                  <span className="font-mono text-fg-2">{c.name}</span> {c.type}
                  {c.pk && ' · key'}
                  {!c.nullable && !c.pk && ' · required'}
                </span>
              ))}
            </p>
            {data.grid.rows.length === 0 ? (
              <Panel className="px-6 py-8 text-center text-[14px] text-fg-3">{page === 0 ? 'This table is empty.' : 'No more rows.'}</Panel>
            ) : (
              <ResultGrid columns={data.grid.columns} rows={data.grid.rows} className="max-h-[560px]" />
            )}
            <div className="flex items-center justify-between text-[13.5px] text-fg-3">
              <span>
                Rows {page * PAGE_SIZE + 1}-{page * PAGE_SIZE + data.grid.rows.length}
              </span>
              <span className="flex gap-2">
                <button type="button" className={btn.secondary} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <CaretLeft /> Previous
                </button>
                <button type="button" className={btn.secondary} disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
                  Next <CaretRight />
                </button>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
