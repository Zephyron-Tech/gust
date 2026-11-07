import type { DeployState, Health } from '@gust/contracts';
import type { ComponentProps, ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const btnBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45';

export const btn = {
  primary: `${btnBase} h-8 px-3.5 bg-accent text-accent-ink hover:bg-accent-hover`,
  secondary: `${btnBase} h-8 px-3.5 border border-line bg-bg-3 text-fg hover:border-fg-3`,
  ghost: `${btnBase} h-8 px-3 text-fg-2 hover:bg-bg-3 hover:text-fg`,
  danger: `${btnBase} h-8 px-3.5 bg-err/15 text-err hover:bg-err hover:text-white`,
};

const pillTone: Record<DeployState, string> = {
  queued: 'bg-fg-2/12 text-fg-2 pulse-dot',
  pulling: 'bg-warn/14 text-warn pulse-dot',
  starting: 'bg-warn/14 text-warn pulse-dot',
  healthy: 'bg-info/14 text-info',
  live: 'bg-ok/14 text-ok',
  failed: 'bg-err/14 text-err',
  superseded: 'bg-fg-3/12 text-fg-3',
  cancelled: 'bg-fg-3/12 text-fg-3',
};

export function Pill({ state }: { state: DeployState }) {
  return (
    <span
      className={cx(
        'inline-flex w-max items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 font-mono text-[11.5px] leading-none before:size-1.5 before:rounded-full before:bg-current',
        pillTone[state],
      )}
    >
      {state}
    </span>
  );
}

export function Dot({ health }: { health: Health }) {
  return (
    <span
      role="img"
      aria-label={health}
      className={cx(
        'size-2 shrink-0 rounded-full',
        health === 'live' && 'bg-ok shadow-[0_0_0_3px_color-mix(in_srgb,var(--g-ok)_18%,transparent)]',
        health === 'failed' && 'bg-err shadow-[0_0_0_3px_color-mix(in_srgb,var(--g-err)_18%,transparent)]',
        health === 'stopped' && 'bg-fg-3',
      )}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-fg-3">{children}</kbd>;
}

export function Meter({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'err' }) {
  return (
    <span className="block h-1 overflow-hidden rounded-full bg-bg-3">
      <span
        className={cx('block h-full rounded-full transition-[width] duration-500', tone === 'err' ? 'bg-err' : 'bg-accent')}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </span>
  );
}

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[26px] leading-tight">{title}</h1>
        {sub && <p className="text-[13px] text-fg-3">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cx('rounded-xl border border-line bg-bg-2', className)} {...rest} />;
}

/** A data table with quiet row rules, the house style for lists in Gust. */
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <Panel className={cx('overflow-hidden', className)}>
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="bg-bg-3 text-left text-[12px] text-fg-3">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr+tr>td]:border-t [&>tr+tr>td]:border-line">{children}</tbody>
      </table>
    </Panel>
  );
}

export function Td({ className, ...rest }: ComponentProps<'td'>) {
  return <td className={cx('px-4 py-3 align-middle', className)} {...rest} />;
}
