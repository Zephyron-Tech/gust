'use client';

import { env } from '@gust/contracts/sample';
import { Eye, EyeSlash } from '@phosphor-icons/react/ssr';
import { useState } from 'react';

import { cx, Table, Td } from '@/components/ui';

export default function EnvironmentPage() {
  const [scope, setScope] = useState<'production' | 'preview'>('production');
  const [shown, setShown] = useState<Set<string>>(new Set());
  const rows = env.filter((e) => e.scope === scope);

  return (
    <div className="view-in space-y-3">
      <fieldset className="flex w-max gap-0.5 rounded-lg border border-line bg-bg-2 p-0.5" aria-label="Scope">
        {(['production', 'preview'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={scope === s}
            onClick={() => setScope(s)}
            className={cx(
              'rounded-md px-3 py-1 text-[12.5px] capitalize transition-colors',
              scope === s ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:text-fg',
            )}
          >
            {s}
          </button>
        ))}
      </fieldset>
      <Table head={['Key', 'Value', '']}>
        {rows.map((e) => {
          const visible = !e.secret || shown.has(e.key);
          return (
            <tr key={e.key + e.scope}>
              <Td className="w-[220px] font-mono text-[12.5px]">{e.key}</Td>
              <Td className={cx('font-mono text-[12.5px]', !visible && 'tracking-[0.15em] text-fg-3')}>
                {visible ? e.value : '••••••••••••'}
              </Td>
              <Td className="w-[110px] text-right">
                {e.secret && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-[12.5px] text-accent"
                    onClick={() =>
                      setShown((s) => {
                        const n = new Set(s);
                        if (n.has(e.key)) n.delete(e.key);
                        else n.add(e.key);
                        return n;
                      })
                    }
                  >
                    {visible ? <EyeSlash size={14} /> : <Eye size={14} />}
                    {visible ? 'Hide' : 'Reveal'}
                  </button>
                )}
              </Td>
            </tr>
          );
        })}
      </Table>
      <p className="text-[13px] text-fg-3">Secrets are encrypted at rest. Revealing one is written to the audit log.</p>
    </div>
  );
}
