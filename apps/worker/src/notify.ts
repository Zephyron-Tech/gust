// Sends alerts to the Discord webhook from DISCORD_WEBHOOK_URL. Without the
// URL nothing is sent. A failed send is logged and never fails a deploy.

const MAX = 1900; // Discord allows 2000 characters per message

export async function notifyDiscord(text: string, log: (line: string) => void = console.log): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text.slice(0, MAX) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) log(`discord alert failed: HTTP ${res.status}`);
  } catch (e) {
    log(`discord alert failed: ${(e as Error).message}`);
  }
}

/** The message for a failed deploy. The error is cut short; it is a line from the engine, not a log dump. */
export function deployFailedText(project: string, service: string, tag: string, error: string | null | undefined): string {
  const reason = (error ?? 'no reason given').split('\n')[0]?.slice(0, 300) ?? '';
  return `Deploy failed: ${project}/${service} (${tag})\n${reason}`;
}
