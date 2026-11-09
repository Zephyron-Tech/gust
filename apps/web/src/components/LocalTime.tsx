'use client';

import { useEffect, useState } from 'react';

const format = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** A timestamp in the viewer's time zone. The server only sends ISO time, so it never guesses the zone. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(format(iso)), [iso]);
  return <time dateTime={iso}>{text ?? '…'}</time>;
}
