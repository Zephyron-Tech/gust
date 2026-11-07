const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "2 hours ago", "yesterday", "just now". */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const a = Math.abs(s);
  if (a < 45) return 'just now';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86_400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86_400 * 30) return rtf.format(Math.round(s / 86_400), 'day');
  return rtf.format(Math.round(s / (86_400 * 30)), 'month');
}

export const clock = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

export function size(mb: number) {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}
