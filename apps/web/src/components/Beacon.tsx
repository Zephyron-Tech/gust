import { cx } from './ui';

const STATES = {
  live: { label: 'Live', core: 'bg-ok', text: 'text-ok', pill: 'border-ok/25 bg-ok/8' },
  failed: { label: 'Failed', core: 'bg-err', text: 'text-err', pill: 'border-err/30 bg-err/8' },
  stopped: { label: 'Stopped', core: '', text: 'text-fg-3', pill: 'border-line bg-bg' },
} as const;

/**
 * A project's state as a small instrument: a core with a halo. Live breathes,
 * stopped is a hollow ring, failed holds still. The label says it in words, so
 * colour is never the only signal. Motion is off for reduced-motion readers.
 */
export function Beacon({ health, showLabel = false, className }: { health: keyof typeof STATES; showLabel?: boolean; className?: string }) {
  const s = STATES[health] ?? STATES.stopped;
  const glyph = (
    <span aria-hidden className="relative grid size-3.5 shrink-0 place-items-center">
      {health === 'live' && <span className="beacon-ripple absolute inset-0 rounded-full bg-ok/45" />}
      {health === 'stopped' ? (
        <span className="size-2.5 rounded-full border-[1.5px] border-fg-3" />
      ) : (
        <span className={cx('relative size-2 rounded-full', s.core, health === 'failed' && 'ring-2 ring-err/25')} />
      )}
    </span>
  );
  if (!showLabel) {
    return (
      <span role="img" aria-label={s.label} className={cx('inline-grid place-items-center', className)}>
        {glyph}
      </span>
    );
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[12.5px] leading-none font-medium',
        s.pill,
        s.text,
        className,
      )}
    >
      {glyph}
      {s.label}
    </span>
  );
}
