import { cx } from './ui';

/**
 * A project's tile: its first letter on a quiet square. Neutral on purpose:
 * status colours are for states and the accent for actions, so a project's
 * identity is its letter, not a colour.
 */
export function ProjectIcon({ slug, size = 'md', className }: { slug: string; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'grid shrink-0 place-items-center border border-line bg-bg-3 font-display font-semibold text-fg-2 uppercase',
        size === 'sm' ? 'size-6 rounded-md text-[12px]' : 'size-9 rounded-[10px] text-[15px]',
        className,
      )}
    >
      {slug.replace(/[^a-z0-9]/gi, '').charAt(0) || '?'}
    </span>
  );
}
