// What the registry card needs to know after a click: whether the worker has finished the job,
// and what to say about the result. Pure, so the card and its tests use the same rules.

export type RegistryAction = 'create' | 'rotate' | 'revoke';

/** An account as the card sees it, with dates as ISO strings. */
export type AccountView = {
  username: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  secretSetAt: string | null;
  secretError: string | null;
  secretCheckedAt: string | null;
} | null;

/** Turns the database row into the card's view (dates as ISO strings). */
export function accountView(
  row: {
    username: string;
    rotatedAt: Date | null;
    revokedAt: Date | null;
    secretSetAt: Date | null;
    secretError: string | null;
    secretCheckedAt: Date | null;
  } | null,
): AccountView {
  if (!row) return null;
  return {
    username: row.username,
    rotatedAt: row.rotatedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    secretSetAt: row.secretSetAt?.toISOString() ?? null,
    secretError: row.secretError,
    secretCheckedAt: row.secretCheckedAt?.toISOString() ?? null,
  };
}

/**
 * The worker has finished the job when its result is in the database. Revoke records `revokedAt`;
 * create and rotate record the outcome of the secret write (`secretCheckedAt`).
 */
export function isJobDone(before: AccountView, after: AccountView, action: RegistryAction): boolean {
  if (!after) return false;
  if (action === 'revoke') return after.revokedAt !== null && after.revokedAt !== (before?.revokedAt ?? null);
  return after.secretCheckedAt !== null && after.secretCheckedAt !== (before?.secretCheckedAt ?? null);
}

export type Outcome = { tone: 'ok' | 'err'; text: string };

/** What the banner says after the job finished. `reactivated` is a rotate on a revoked account. */
export function outcome(state: AccountView, action: RegistryAction, reactivated = false): Outcome {
  if (action === 'revoke') return { tone: 'ok', text: 'Revoked. This account can no longer push.' };
  if (state?.secretError) return { tone: 'err', text: `The GitHub secrets were not set: ${state.secretError}` };
  if (action === 'create') return { tone: 'ok', text: 'Account created. The GitHub secrets are set.' };
  if (reactivated) return { tone: 'ok', text: 'Account reactivated. The GitHub secrets are set.' };
  return { tone: 'ok', text: 'Password rotated. The GitHub secrets are set.' };
}
