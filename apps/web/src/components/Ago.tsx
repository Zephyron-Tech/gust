'use client';

import { ago } from '@/lib/format';

/**
 * Relative time. Server and browser compute it a moment apart, so the text
 * may differ by a minute or an hour; the browser's value wins without a warning.
 */
export function Ago({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString('en-GB')} className={className} suppressHydrationWarning>
      {ago(iso)}
    </time>
  );
}
