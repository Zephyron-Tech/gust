import { cx } from './ui';

// No dot, no pill: a state is its colour and its word. The word is the label,
// so colour is never the only signal.
const STATES = {
  live: { label: 'Live', ink: 'text-ok', glow: 'bg-[radial-gradient(closest-side,var(--color-ok),transparent)]' },
  failed: { label: 'Failed', ink: 'text-err', glow: 'bg-[radial-gradient(closest-side,var(--color-err),transparent)]' },
  stopped: { label: 'Stopped', ink: 'text-fg-3', glow: null },
} as const;

export type Health = keyof typeof STATES;

/** The state's text colour, for names and other text that should carry it. */
export const inkOf = (health: Health) => (STATES[health] ?? STATES.stopped).ink;

/** The state word. Visible with `showLabel`, otherwise read by screen readers only. */
export function Beacon({ health, showLabel = false, className }: { health: Health; showLabel?: boolean; className?: string }) {
  const s = STATES[health] ?? STATES.stopped;
  if (!showLabel) return <span className="sr-only">{s.label}</span>;
  return <span className={cx('text-[13px] leading-none font-medium', s.ink, className)}>{s.label}</span>;
}

/**
 * A soft colour bloom in a card's top-right corner. Live breathes slowly, failed
 * holds still, stopped has none. Put it in a `relative isolate overflow-hidden` box.
 */
export function StateGlow({ health, className }: { health: Health; className?: string }) {
  const s = STATES[health] ?? STATES.stopped;
  if (!s.glow) return null;
  return (
    <span
      aria-hidden
      className={cx(
        'pointer-events-none absolute -top-16 -right-16 -z-10 size-56 rounded-full opacity-35',
        s.glow,
        health === 'live' && 'state-breathe',
        className,
      )}
    />
  );
}
