'use client';

import { env } from '@gust/contracts/sample';
import { Eye, EyeSlash } from '@phosphor-icons/react/ssr';
import { useState } from 'react';

import { Segmented } from '@/components/Segmented';
import { cx, Table, Td } from '@/components/ui';

export default function EnvironmentPage() {
  const [scope, setScope] = useState<'production' | 'preview'>('production');
  const [shown, setShown] = useState<Set<string>>(new Set());
  const rows = env.filter((e) => e.scope === scope);

  return (
    <div className="view-in space-y-4">
      <Segmented options={['production', 'preview'] as const} value={scope} onChange={setScope} label="Scope" />
      <Table head={['Key', 'Value', '']}>
        {rows.map((e) => {
          const visible = !e.secret || shown.has(e.key);
          return (
            <tr key={e.key + e.scope}>
              <Td className="w-[240px] font-mono text-[13px]">{e.key}</Td>
              <Td className={cx('font-mono text-[13px] text-fg-2', !visible && 'tracking-[0.15em] text-fg-3')}>
                <span key={String(visible)} className="fade-in">
                  {visible ? e.value : '••••••••••••'}
                </span>
              </Td>
              <Td className="w-[110px] text-right">
                {e.secret && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[14px] font-medium text-accent transition-colors duration-150 hover:bg-accent-soft active:bg-accent-soft/70"
                    onClick={() =>
                      setShown((s) => {
                        const n = new Set(s);
                        if (n.has(e.key)) n.delete(e.key);
                        else n.add(e.key);
                        return n;
                      })
                    }
                  >
                    {visible ? <EyeSlash size={17} /> : <Eye size={17} />}
                    {visible ? 'Hide' : 'Reveal'}
                  </button>
                )}
              </Td>
            </tr>
          );
        })}
      </Table>
      <p className="text-[14px] text-fg-3">Secrets are encrypted at rest. Revealing one is written to the audit log.</p>
    </div>
  );
}
