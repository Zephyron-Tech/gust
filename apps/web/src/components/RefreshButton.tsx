'use client';

import { ArrowsClockwise } from '@phosphor-icons/react/ssr';

import { btn, cx } from './ui';

/** The one Refresh button of the app. While `loading`, its arrows turn; the button keeps its place and label. */
export function RefreshButton({
  onClick,
  loading = false,
  disabled = false,
}: {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={btn.secondary} onClick={onClick} disabled={disabled || loading}>
      <ArrowsClockwise size={16} weight="bold" className={cx(loading && 'animate-spin')} />
      Refresh
    </button>
  );
}
