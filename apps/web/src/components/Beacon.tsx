import { cx } from './ui';

// No dot, no pill: a state is its colour and its word. The word is the label,
// so colour is never the only signal.
const STATES = {
  live: { label: 'Live', ink: 'text-ok', light: 'var(--color-ok)' },
  failed: { label: 'Failed', ink: 'text-err', light: 'var(--color-err)' },
  stopped: { label: 'Stopped', ink: 'text-fg-3', light: null },
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
 * The state as light falling into the card's top-right corner: a diagonal tint that
 * fades out before the middle, mixed toward the surface so it reads as lit paper,
 * not as a glowing blob. Live breathes a little; failed and stopped hold still.
 * Put it in a `relative isolate overflow-hidden` box.
 */
export function StateGlow({ health, className }: { health: Health; className?: string }) {
  const s = STATES[health] ?? STATES.stopped;
  if (!s.light) return null;
  return (
    <span
      aria-hidden
      className={cx('pointer-events-none absolute inset-0 -z-10 rounded-[inherit]', health === 'live' && 'state-breathe', className)}
      style={{
        backgroundImage: `linear-gradient(to bottom left, color-mix(in oklab, ${s.light} 15%, transparent) 0%, transparent 52%)`,
      }}
    />
  );
}
