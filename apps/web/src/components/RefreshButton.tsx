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

/** Runs a refresh and keeps `loading` on for at least a moment, so a fast answer still shows the turn. */
export async function withMinimumSpin(task: Promise<unknown>, ms = 600) {
  await Promise.all([task, new Promise((r) => setTimeout(r, ms))]);
}
