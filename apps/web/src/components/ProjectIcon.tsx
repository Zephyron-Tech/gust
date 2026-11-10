import { cx } from './ui';

/**
 * A project's tile: its icon (the site's favicon or one uploaded by an admin),
 * or its first letter on a quiet square. Neutral on purpose: status colours
 * are for states and the accent for actions, so identity is the icon or letter.
 */
export function ProjectIcon({
  slug,
  src,
  size = 'md',
  className,
}: {
  slug: string;
  src?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const frame = cx(
    'grid shrink-0 place-items-center overflow-hidden border border-line bg-bg-3 font-display font-semibold text-fg-2 uppercase',
    size === 'sm' ? 'size-6 rounded-md text-[12px]' : 'size-9 rounded-[10px] text-[15px]',
    className,
  );
  if (src) {
    return (
      <span aria-hidden className={frame}>
        {/* biome-ignore lint/performance/noImgElement: a 256 KB icon served by the app itself; next/image would only add a loader */}
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className={cx('size-full object-contain', size === 'sm' ? 'p-[3px]' : 'p-[5px]')}
        />
      </span>
    );
  }
  return (
    <span aria-hidden className={frame}>
      {slug.replace(/[^a-z0-9]/gi, '').charAt(0) || '?'}
    </span>
  );
}
