// Pure helpers of the GitHub App webhook and of the pull-request preview limit. No I/O, so they
// can be tested directly.
import { createHmac, timingSafeEqual } from 'node:crypto';

/** GitHub signs the raw body with the webhook secret: `X-Hub-Signature-256: sha256=<hex>`. */
export function signatureValid(secret: string, body: string, header: string | null): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Most pull request previews one project runs at once, the newest counted. */
export const MAX_PR_PREVIEWS = 10;

/**
 * The pull request to remove so a new preview fits: when `running` (previews already up, the new
 * one not among them) has reached `limit`, the one changed least recently. Null when there is room.
 */
export function pickEviction(running: { number: number; updatedAt: Date }[], limit = MAX_PR_PREVIEWS): number | null {
  if (running.length < limit) return null;
  const oldest = [...running].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())[0];
  return oldest?.number ?? null;
}
