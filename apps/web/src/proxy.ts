import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Whether a state-changing request comes from Gust's own pages. The session
 * cookie is SameSite=Lax, which already keeps it off cross-site POSTs; this is
 * the second lock, so a browser quirk or a sibling subdomain (apps deployed
 * here live under the same domain) cannot change anything with a user's session.
 */
function sameOrigin(req: NextRequest) {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true; // not a browser form or fetch: curl, the CLI
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Everything except the sign-in page, the auth API, the GitHub deploy API
// (it checks a GitHub OIDC token instead) and static files needs a session.
// This only checks that the cookie is there; route handlers and pages verify
// the session itself.
export function proxy(req: NextRequest) {
  const api = req.nextUrl.pathname.startsWith('/api/');
  if (api && !SAFE.has(req.method) && !sameOrigin(req)) {
    return NextResponse.json({ error: 'This request did not come from Gust' }, { status: 403 });
  }
  if (getSessionCookie(req, { cookiePrefix: 'gust' })) return NextResponse.next();
  if (api) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const url = new URL('/login', req.url);
  url.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!login|api/auth|api/deploy(?:/|$)|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|gust-icon).*)',
  ],
};
