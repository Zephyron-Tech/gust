// Env var secrets at rest: AES-256-GCM with the master key from
// GUST_MASTER_KEY (32 random bytes, base64). The key lives in the server's
// environment (/opt/gust/.env), never in the database.
// Stored format: v1.<iv>.<ciphertext>.<tag>, each part base64url.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const raw = process.env.GUST_MASTER_KEY;
  if (!raw) throw new Error('GUST_MASTER_KEY is not set');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('GUST_MASTER_KEY must be 32 bytes, base64 encoded');
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv, ct, c.getAuthTag()].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decryptSecret(stored: string): string {
  const [v, iv, ct, tag] = stored.split('.');
  if (v !== 'v1' || !iv || !ct || !tag) throw new Error('Unknown secret format');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
