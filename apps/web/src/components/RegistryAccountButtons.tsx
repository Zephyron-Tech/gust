'use client';

import { ArrowClockwise } from '@phosphor-icons/react/ssr';

import type { AccountView, RegistryAction } from '@/lib/registry-action';
import { btn } from './ui';

/**
 * The actions of one project's registry account. While a job runs, all buttons are locked and the
 * one that started it shows the spinner and says what it is doing.
 */
export function RegistryAccountButtons({
  status,
  busy,
  onAct,
}: {
  status: AccountView;
  busy: RegistryAction | null;
  onAct: (action: RegistryAction, opts?: { reactivate?: boolean }) => void;
}) {
  const spin = (on: boolean) => (on ? <ArrowClockwise className="animate-spin" /> : null);

  if (!status || status.revokedAt) {
    const reactivate = !!status;
    const working = busy === 'create' || (reactivate && busy === 'rotate');
    return (
      <button
        type="button"
        className={btn.primary}
        disabled={busy !== null}
        aria-busy={working}
        onClick={() => onAct(reactivate ? 'rotate' : 'create', { reactivate })}
      >
        {spin(working)}
        {working ? (reactivate ? 'Reactivating…' : 'Creating…') : reactivate ? 'Reactivate' : 'Create account'}
      </button>
    );
  }

  const rotating = busy === 'rotate';
  const revoking = busy === 'revoke';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn.secondary} disabled={busy !== null} aria-busy={rotating} onClick={() => onAct('rotate')}>
        {spin(rotating)}
        {rotating ? 'Rotating…' : status.secretError ? 'Retry secrets' : 'Rotate password'}
      </button>
      <button type="button" className={btn.secondary} disabled={busy !== null} aria-busy={revoking} onClick={() => onAct('revoke')}>
        {spin(revoking)}
        {revoking ? 'Revoking…' : 'Revoke'}
      </button>
    </div>
  );
}
