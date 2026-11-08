import 'server-only';

// Sign-in for Gust. Two ways in:
// - Authentik (OIDC), the normal one. Users in the Authentik group named by
//   GUST_ADMIN_GROUP (default gust-admins) become admins, everyone else members.
// - The break-glass account (email and password), for when Authentik itself
//   is down. Self sign-up is off; the account is created with
//   `pnpm --filter @gust/web auth:break-glass`.
import { account, db, session, user, verification } from '@gust/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';

const authentik = process.env.AUTHENTIK_ISSUER && process.env.AUTHENTIK_CLIENT_ID;
const adminGroup = process.env.GUST_ADMIN_GROUP ?? 'gust-admins';

export const authentikEnabled = Boolean(authentik);

// Better Auth drops `role` from mapProfileToUser because the field is not
// user input (input: false keeps people from setting their own role). So the
// role from the Authentik groups is noted here by email and written by the
// user create/update hooks that run right after, in the same callback.
const authentikRoles = new Map<string, Role>();

function withAuthentikRole(data: Record<string, unknown>) {
  const email = typeof data.email === 'string' ? data.email.toLowerCase() : null;
  const role = email ? authentikRoles.get(email) : undefined;
  if (!email || !role) return;
  authentikRoles.delete(email);
  return { data: { ...data, role } };
}

export const auth = betterAuth({
  appName: 'Gust',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3100',
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 16 },
  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'member', input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  databaseHooks: {
    user: {
      create: { before: async (data) => withAuthentikRole(data) },
      update: { before: async (data) => withAuthentikRole(data) },
    },
  },
  advanced: { cookiePrefix: 'gust' },
  rateLimit: { enabled: true, window: 60, max: 30 },
  plugins: [
    ...(authentik
      ? [
          genericOAuth({
            config: [
              {
                providerId: 'authentik',
                name: 'Authentik',
                discoveryUrl: `${process.env.AUTHENTIK_ISSUER?.replace(/\/$/, '')}/.well-known/openid-configuration`,
                clientId: process.env.AUTHENTIK_CLIENT_ID as string,
                clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
                scopes: ['openid', 'profile', 'email'],
                pkce: true,
                overrideUserInfo: true,
                mapProfileToUser: (profile) => {
                  if (typeof profile.email === 'string') {
                    const admin = Array.isArray(profile.groups) && profile.groups.includes(adminGroup);
                    authentikRoles.set(profile.email.toLowerCase(), admin ? 'admin' : 'member');
                  }
                  return {};
                },
              },
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
});

export type Role = 'admin' | 'member';
export type SessionUser = { id: string; name: string; email: string; role: Role };

/** The signed-in user for a request, or null. */
export async function currentUser(headers: Headers): Promise<SessionUser | null> {
  const s = await auth.api.getSession({ headers });
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string };
  return { id: u.id, name: u.name, email: u.email, role: u.role === 'admin' ? 'admin' : 'member' };
}

/**
 * Guard for route handlers: returns the user, or a 401/403 response.
 * Usage: `const u = await requireUser(req, 'admin'); if (u instanceof Response) return u;`
 */
export async function requireUser(req: Request, role?: Role): Promise<SessionUser | Response> {
  const u = await currentUser(req.headers);
  if (!u) return Response.json({ error: 'Sign in first' }, { status: 401 });
  if (role === 'admin' && u.role !== 'admin') return Response.json({ error: 'Only admins can do this' }, { status: 403 });
  return u;
}
