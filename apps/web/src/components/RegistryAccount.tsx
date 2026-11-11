'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { LocalTime } from './LocalTime';
import { btn, Panel } from './ui';

export type RegistryStatus = {
  username: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  secretSetAt: string | null;
  secretError: string | null;
} | null;

/**
 * The project's own registry account: whether it exists, when its password last changed, and whether
 * its GitHub secrets were written. Only admins may change it; everyone sees the state.
 */
export function RegistryAccount({ slug, status, canManage }: { slug: string; status: RegistryStatus; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function act(action: 'create' | 'rotate' | 'revoke') {
    setBusy(action);
    setMessage(null);
    const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/registry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? 'Could not reach the server. Try again.');
      return;
    }
    // The worker does the work; the status follows on the next load.
    setMessage('Queued. The secrets update within a minute.');
    setTimeout(() => router.refresh(), 4000);
  }

  return (
    <Panel className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="space-y-1 text-[14.5px]">
        <p className="font-medium text-fg">Registry account</p>
        {!status ? (
          <p className="text-fg-3">No account yet. Create one to push images for this project.</p>
        ) : status.revokedAt ? (
          <p className="text-fg-3">
            <span className="font-mono text-[13px]">{status.username}</span> is revoked. It cannot push.
          </p>
        ) : status.secretError ? (
          <p className="text-err">The GitHub secrets were not set: {status.secretError}</p>
        ) : status.secretSetAt ? (
          <p className="text-fg-2">
            <span className="font-mono text-[13px]">{status.username}</span>, secrets set on GitHub.
          </p>
        ) : (
          <p className="text-fg-3">
            <span className="font-mono text-[13px]">{status.username}</span>, secrets pending.
          </p>
        )}
        {status?.rotatedAt && !status.revokedAt && (
          <p className="text-[13px] text-fg-3">
            Password changed <LocalTime iso={status.rotatedAt} />
          </p>
        )}
        {message && <p className="text-[13px] text-fg-3">{message}</p>}
      </div>
      {canManage && (
        <div className="flex items-center gap-2">
          {!status || status.revokedAt ? (
            <button type="button" className={btn.primary} disabled={!!busy} onClick={() => void act(status ? 'rotate' : 'create')}>
              {busy ? 'Working…' : status ? 'Reactivate' : 'Create account'}
            </button>
          ) : (
            <>
              <button type="button" className={btn.secondary} disabled={!!busy} onClick={() => void act('rotate')}>
                {busy === 'rotate' ? 'Working…' : status.secretError ? 'Retry secrets' : 'Rotate password'}
              </button>
              <button type="button" className={btn.secondary} disabled={!!busy} onClick={() => void act('revoke')}>
                {busy === 'revoke' ? 'Working…' : 'Revoke'}
              </button>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
