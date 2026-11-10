// Project icons: what counts as one, and which addresses may be fetched for
// one. Pure functions, so the rules are tested without the network.

export const ICON_MAX_BYTES = 256 * 1024;
/** How long a site without an icon is left alone before it is asked again. */
export const ICON_RECHECK_MS = 24 * 60 * 60 * 1000;

const SVG_UNSAFE = /<script|<foreignObject|<!ENTITY|<!DOCTYPE[^>]*\[|\son[a-z]+\s*=|javascript:|data:text\/html/i;

/** The image type of the bytes, or null when they are not an icon we accept. */
export function sniffIcon(bytes: Uint8Array): string | null {
  const b = bytes;
  const at = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x);
  if (b.length < 8) return null;
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && b.length >= 12 && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (at(0, 0x00, 0x00, 0x01, 0x00)) return 'image/x-icon';
  // SVG is text. Scripts, foreign content and external entities are refused,
  // so an uploaded icon cannot run anything when opened.
  if (b.length <= ICON_MAX_BYTES) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(b).trimStart();
    if (text.startsWith('<') && /<svg[\s>]/i.test(text) && !SVG_UNSAFE.test(text)) return 'image/svg+xml';
  }
  return null;
}

/** True for addresses on the public internet. Private, loopback, link-local, shared and multicast ranges are not. */
export function isPublicIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.includes(':')) {
    if (v.startsWith('::ffff:')) {
      const rest = v.slice(7);
      return /^\d+\.\d+\.\d+\.\d+$/.test(rest) && isPublicIp(rest);
    }
    if (v === '::' || v === '::1') return false;
    if (/^f[cd]/.test(v)) return false; // fc00::/7 unique local
    if (/^fe[89ab]/.test(v)) return false; // fe80::/10 link local
    if (v.startsWith('ff')) return false; // multicast
    if (v.startsWith('2001:db8')) return false; // documentation
    return true;
  }
  const parts = v.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

/** Whether a site without an icon should be asked again. */
export function iconCheckDue(checkedAt: Date | null | undefined, now = Date.now()): boolean {
  return !checkedAt || now - checkedAt.getTime() > ICON_RECHECK_MS;
}
