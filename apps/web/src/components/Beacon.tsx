import { cx } from './ui';

// The state is drawn as a heart-rate trace: live runs a pulse along it, stopped is
// a flat line, failed is an erratic trace. The label says it in words too, so colour
// is never the only signal. Motion is off for reduced-motion readers.
const STATES = {
  live: { label: 'Live', trace: 'M0 6H6L8 2L11 10L13 4L15 6H24', ink: 'text-ok', pill: 'border-ok/25 bg-ok/8' },
  failed: { label: 'Failed', trace: 'M0 6H4L6 1.5L8 10.5L10 3L12 9L14 6H24', ink: 'text-err', pill: 'border-err/30 bg-err/8' },
  stopped: { label: 'Stopped', trace: 'M0 6H24', ink: 'text-fg-3', pill: 'border-line bg-bg' },
} as const;

export function Beacon({ health, showLabel = false, className }: { health: keyof typeof STATES; showLabel?: boolean; className?: string }) {
  const s = STATES[health] ?? STATES.stopped;
  const trace = (
    <svg
      aria-hidden
      viewBox="0 0 24 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('shrink-0 overflow-visible', showLabel ? 'h-3 w-5' : 'h-3 w-4', s.ink)}
    >
      <path d={s.trace} className={health === 'live' ? 'beacon-base' : undefined} />
      {health === 'live' && <path d={s.trace} pathLength={100} strokeWidth={2.25} className="beacon-pulse" />}
    </svg>
  );
  if (!showLabel) {
    return (
      <span role="img" aria-label={s.label} className={cx('inline-grid place-items-center', className)}>
        {trace}
      </span>
    );
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[12.5px] leading-none font-medium',
        s.pill,
        s.ink,
        className,
      )}
    >
      {trace}
      {s.label}
    </span>
  );
}
