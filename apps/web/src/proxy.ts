import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

// Everything except the sign-in page, the auth API and static files needs a
// session. This only checks that the cookie is there; route handlers and
// pages verify the session itself.
export function proxy(req: NextRequest) {
  if (getSessionCookie(req, { cookiePrefix: 'gust' })) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const url = new URL('/login', req.url);
  url.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|gust-icon).*)'],
};
