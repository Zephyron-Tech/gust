# Sign-in through Authentik

Gust signs people in with Authentik over OpenID Connect (Better Auth's
generic OAuth plugin). Setup in Authentik, once:

1. **Applications → Providers → Create → OAuth2/OpenID Provider**
   - Name: `gust`
   - Client type: Confidential
   - Redirect URI (strict): `https://gust.zephyron.tech/api/auth/callback/authentik`
     (for local dev also `http://localhost:3100/api/auth/callback/authentik`)
   - Scopes: `openid`, `email`, `profile` (the default profile scope carries `groups`)
   - Signing key: the default certificate
2. **Applications → Create**: name `Gust`, slug `gust`, provider `gust`.
3. **Directory → Groups**: create `gust-admins` and add the people who may
   manage everything. Everyone else who may open Gust gets access through the
   application's policy bindings and signs in as a member.
4. Put the values into Gust's environment:

```
AUTHENTIK_ISSUER=https://auth.zephyron.tech/application/o/gust/
AUTHENTIK_CLIENT_ID=<client id>
AUTHENTIK_CLIENT_SECRET=<client secret>
GUST_ADMIN_GROUP=gust-admins
```

Roles are read from the `groups` claim at every sign-in, so removing someone
from `gust-admins` takes effect the next time they sign in.

## Break-glass account

When Authentik itself is down, the email and password account still works.
It is created or reset on the server with:

```bash
BREAK_GLASS_EMAIL=… BREAK_GLASS_PASSWORD=… pnpm --filter @gust/web auth:break-glass
```

Self sign-up is off; this script is the only way to create a password account.
The callback path above follows Better Auth 1.7 and still needs a check
against a real Authentik before production.
