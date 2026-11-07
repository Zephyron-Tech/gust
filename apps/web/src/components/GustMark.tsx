// The Gust mark, the same geometry as packages/brand/svg/gust-mark-tile.svg.
export function GustMark({ size = 24, tile = true }: { size?: number; tile?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      {tile && <rect width="64" height="64" rx="15" fill="#11131E" />}
      <path
        d="M33 34H44A15 15 0 1 1 29 19H56"
        fill="none"
        stroke={tile ? '#FFFFFF' : 'currentColor'}
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M41 9H54" fill="none" stroke="#8B80FF" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}
