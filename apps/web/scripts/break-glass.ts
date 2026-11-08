// Creates or resets the break-glass admin: the one account that signs in with
// email and password, for when Authentik is down.
//   BREAK_GLASS_EMAIL=… BREAK_GLASS_PASSWORD=… pnpm --filter @gust/web auth:break-glass
import { account, db, pool, user } from '@gust/db';
import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';

const email = process.env.BREAK_GLASS_EMAIL?.trim().toLowerCase();
const password = process.env.BREAK_GLASS_PASSWORD;
if (!email || !password || password.length < 16) {
  console.error('Set BREAK_GLASS_EMAIL and a BREAK_GLASS_PASSWORD of at least 16 characters.');
  process.exit(1);
}

const hash = await hashPassword(password);
const [existing] = await db.select().from(user).where(eq(user.email, email));
const id = existing?.id ?? crypto.randomUUID();
if (!existing) {
  await db.insert(user).values({ id, name: 'Break-glass admin', email, emailVerified: true, role: 'admin' });
} else {
  await db.update(user).set({ role: 'admin', updatedAt: new Date() }).where(eq(user.id, id));
}
const [cred] = await db
  .select()
  .from(account)
  .where(and(eq(account.userId, id), eq(account.providerId, 'credential')));
if (cred) await db.update(account).set({ password: hash, updatedAt: new Date() }).where(eq(account.id, cred.id));
else await db.insert(account).values({ id: crypto.randomUUID(), accountId: id, providerId: 'credential', userId: id, password: hash });

console.log(`break-glass admin ready: ${email}`);
await pool.end();
