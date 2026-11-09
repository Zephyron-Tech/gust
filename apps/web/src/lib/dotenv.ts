/** Reads pasted .env text into key/value pairs: skips blanks and comments, drops `export` and surrounding quotes. */
export function parseDotenv(text: string): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m?.[1]) continue;
    let value = m[2] ?? '';
    const q = value[0];
    if ((q === '"' || q === "'") && value.endsWith(q) && value.length >= 2) {
      value = value.slice(1, -1);
      if (q === '"') value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    out.push({ key: m[1].toUpperCase(), value });
  }
  return out;
}
