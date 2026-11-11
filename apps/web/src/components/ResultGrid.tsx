import { cx } from '@/components/ui';

/** Rows of text cells from a query or a table. Values are literal data, so they are monospace; null is shown as NULL. */
export function ResultGrid({ columns, rows, className }: { columns: string[]; rows: (string | null)[][]; className?: string }) {
  return (
    <div className={cx('overflow-auto rounded-xl border border-line', className)}>
      <table className="w-full border-collapse font-mono text-[12.5px]">
        <thead className="sticky top-0 bg-bg-3 text-left text-fg-2">
          <tr>
            {columns.map((c, i) => (
              <th key={`${c}-${i}`} className="border-b border-line px-3 py-2 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line first:border-t-0 hover:bg-bg-3/40">
              {r.map((v, j) => (
                <td key={j} title={v ?? undefined} className="max-w-[360px] truncate px-3 py-1.5 whitespace-nowrap">
                  {v === null ? <span className="text-fg-3">NULL</span> : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
