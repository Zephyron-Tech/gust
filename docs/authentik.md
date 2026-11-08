# Sign-in through Authentik

Gust signs people in with Authentik over OpenID Connect (Better Auth's
generic OAuth plugin). Setup in Authentik, once:

1. **Applications → Providers → Create → OAuth2/OpenID Provider**
   - Name: `gust`
   - Client type: Confidential
   - Redirect URIs (strict):
     - `https://gust.zephyron.tech/api/auth/callback/authentik`
     - `http://localhost:3100/api/auth/callback/authentik` (local dev)
   - Scopes: `openid`, `email`, `profile` (the default profile scope carries `groups`)
   - Signing key: the default certificate
2. **Applications → Create**: name `Gust`, slug `gust`, provider `gust`.
   Without policy bindings everyone in Authentik may sign in, as a member.
3. **Directory → Groups**: create `gust-admin` and add the people who may
   manage everything (delete, change and reveal secrets).
4. Put the values into Gust's environment (`apps/web/.env.local` locally):

```
AUTHENTIK_ISSUER=https://auth.zephyron.tech/application/o/gust/
AUTHENTIK_CLIENT_ID=<client id>
AUTHENTIK_CLIENT_SECRET=<client secret>
GUST_ADMIN_GROUP=gust-admin
```

The redirect URIs above were checked against Authentik 2026.5 and
Better Auth 1.7.

## Roles

The role comes from the `groups` claim at every sign-in: members of
`GUST_ADMIN_GROUP` become admins, everyone else members. Removing someone
from the group takes effect the next time they sign in.

Better Auth drops `role` from `mapProfileToUser` because the field is not
user input (`input: false`, so nobody can set their own role through the
API). `apps/web/src/lib/auth.ts` therefore notes the role by email in
`mapProfileToUser` and writes it in the user create/update database hooks
that run in the same callback.

## When sign-in fails

- Better Auth allows 3 sign-in requests per 10 seconds per address; the
  login page then says "Too many attempts".
- A failed callback returns to `/login?error=<code>`, and the page shows the
  reason.
- In dev the first load of `/login` compiles the page; the button does
  nothing until the page has loaded.

## Break-glass account

When Authentik itself is down, the email and password account still works.
It is created or reset with:

```bash
BREAK_GLASS_EMAIL=… BREAK_GLASS_PASSWORD=… pnpm --filter @gust/web auth:break-glass
```

Locally the script reads both from `apps/web/.env.local`. Self sign-up is
off; this script is the only way to create a password account.
