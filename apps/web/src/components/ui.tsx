import type { DeployState, Health } from '@gust/contracts';
import type { ComponentProps, ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const btnBase =
  'inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-4 text-[14px] font-medium transition-[background-color,border-color,color,translate,box-shadow] duration-150 ease-[var(--ease-out)] active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[18px]';

export const btn = {
  primary: `${btnBase} bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] hover:bg-accent-hover active:shadow-none`,
  secondary: `${btnBase} border border-line bg-bg-3 text-fg hover:border-fg-3`,
  ghost: `${btnBase} px-3 text-fg-2 hover:bg-bg-3 hover:text-fg`,
  danger: `${btnBase} bg-err/15 text-err hover:bg-err hover:text-white`,
};

const pillTone: Record<DeployState, string> = {
  queued: 'bg-fg-2/12 text-fg-2 pulse-dot',
  pulling: 'bg-warn/14 text-warn pulse-dot',
  starting: 'bg-warn/14 text-warn pulse-dot',
  healthy: 'bg-info/14 text-info',
  live: 'bg-ok/14 text-ok',
  failed: 'bg-err/14 text-err',
  superseded: 'bg-fg-3/12 text-fg-2',
  cancelled: 'bg-fg-3/12 text-fg-2',
};

const pillLabel: Record<DeployState, string> = {
  queued: 'Queued',
  pulling: 'Pulling',
  starting: 'Starting',
  healthy: 'Healthy',
  live: 'Live',
  failed: 'Failed',
  superseded: 'Superseded',
  cancelled: 'Cancelled',
};

export function Pill({ state }: { state: DeployState }) {
  return (
    <span
      className={cx(
        'inline-flex w-max items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] leading-none font-medium transition-[background-color,color] duration-300 before:size-1.5 before:rounded-full before:bg-current',
        pillTone[state],
      )}
    >
      {pillLabel[state]}
    </span>
  );
}

export function Dot({ health, className }: { health: Health; className?: string }) {
  return (
    <span
      role="img"
      aria-label={health}
      className={cx(
        'size-2 shrink-0 rounded-full',
        className,
        health === 'live' && 'bg-ok ring-[3px] ring-ok/20',
        health === 'failed' && 'bg-err ring-[3px] ring-err/20',
        health === 'stopped' && 'bg-fg-3',
      )}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[12px] leading-none text-fg-3">{children}</kbd>;
}

export function Meter({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'err' }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-bg-3">
      <span
        className={cx(
          'block h-full w-full origin-left rounded-full transition-[scale,background-color] duration-700 ease-[var(--ease-out)]',
          tone === 'err' ? 'bg-err' : 'bg-accent',
        )}
        style={{ scale: `${Math.min(100, Math.max(0, value)) / 100} 1` }}
      />
    </span>
  );
}

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-[30px] leading-[1.1]">{title}</h1>
        {sub && <p className="text-[14.5px] text-fg-3">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cx('rounded-2xl border border-line bg-bg-2', className)} {...rest} />;
}

/** A data table with quiet row rules, the house style for lists in Gust. */
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <Panel className={cx('overflow-hidden', className)}>
      <table className="w-full text-[14.5px]">
        <thead>
          <tr className="text-left text-[13px] text-fg-3">
            {head.map((h, i) => (
              <th key={i} className="border-b border-line px-5 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr+tr>td]:border-t [&>tr+tr>td]:border-line [&>tr]:transition-colors [&>tr:hover]:bg-bg-3/50">
          {children}
        </tbody>
      </table>
    </Panel>
  );
}

export function Td({ className, ...rest }: ComponentProps<'td'>) {
  return <td className={cx('px-5 py-3.5 align-middle', className)} {...rest} />;
}

/** Literal code inline: hashes, ids, paths, image names, env keys. */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-[13px] tracking-tight', className)}>{children}</span>;
}

/** A small neutral tag: service names, containers. */
export function Tag({ children, tone }: { children: ReactNode; tone?: 'info' }) {
  return (
    <span
      className={cx('rounded-md bg-bg-3 px-2 py-1 text-[12.5px] leading-none font-medium', tone === 'info' ? 'text-info' : 'text-fg-2')}
    >
      {children}
    </span>
  );
}
