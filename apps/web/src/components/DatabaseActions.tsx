'use client';

import { DownloadSimple, Key, Trash } from '@phosphor-icons/react/ssr';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { btn } from '@/components/ui';
import type { DatabaseKind, DatabaseRow } from '@/lib/databases-db';
import { useDemo } from '@/lib/demo';

type Target = Pick<DatabaseRow, 'id' | 'database' | 'state'> & { kind?: DatabaseKind };

/**
 * Back up, rotate the password, delete: the buttons of one database and their confirmations.
 * Used by the project's Databases tab and by the Storage detail page. Admins only; the
 * routes check the role again.
 */
export function DatabaseActions({ slug, db, onDeleted }: { slug: string; db: Target; onDeleted?: () => void }) {
  const router = useRouter();
  const { notify } = useDemo();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [rotating, setRotating] = useState(false);

  async function call(path: string, method: 'POST' | 'DELETE') {
    setBusy(true);
    const res = await fetch(`/api/projects/${slug}/databases/${db.id}${path}`, { method }).catch(() => null);
    setBusy(false);
    return res?.ok ?? false;
  }

  async function backup() {
    if (!(await call('/backup', 'POST'))) return notify('Backup not started', 'Gust did not accept the request. Try again.', 'err');
    notify(`Backup of ${db.database} queued`, 'It appears in the list when the dump is written.');
    router.refresh();
    // The worker writes the audit row after the dump; refresh again once it is likely done.
    window.setTimeout(() => router.refresh(), 4000);
  }

  async function rotate() {
    const ok = await call('/rotate', 'POST');
    setRotating(false);
    if (!ok) return notify('Rotation not started', 'Gust did not accept the request. Try again.', 'err');
    notify(`Rotating the password of ${db.database}`, 'Redeploy the app once it is done, so it gets the new DATABASE_URL.');
    router.refresh();
  }

  async function remove() {
    const ok = await call('', 'DELETE');
    setRemoving(false);
    if (!ok) return notify('Delete failed', 'Gust did not accept the request. Try again.', 'err');
    notify(`Deleting ${db.database}`, 'The database and its login are dropped by the worker. Backups stay.');
    router.refresh();
    onDeleted?.();
  }

  return (
    <>
      <div className="flex gap-2">
        {db.state === 'ready' && (
          <button type="button" className={btn.secondary} disabled={busy} onClick={() => void backup()}>
            <DownloadSimple /> Back up
          </button>
        )}
        {db.state === 'ready' && (
          <button type="button" className={btn.secondary} disabled={busy} onClick={() => setRotating(true)}>
            <Key /> Rotate password
          </button>
        )}
        {db.state !== 'provisioning' && db.state !== 'deleting' && (
          <button type="button" className={btn.ghost} disabled={busy} onClick={() => setRemoving(true)}>
            <Trash /> Delete
          </button>
        )}
      </div>

      <ConfirmDialog
        open={rotating}
        onOpenChange={setRotating}
        title={`Rotate the password of ${db.database}?`}
        description="A new password replaces the old one at once, so the running app stops connecting until you redeploy it. It then gets the new DATABASE_URL."
        actions={
          <>
            <button type="button" className={btn.ghost} onClick={() => setRotating(false)}>
              Cancel
            </button>
            <button type="button" className={btn.primary} disabled={busy} onClick={() => void rotate()}>
              Rotate password
            </button>
          </>
        }
      />

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Delete ${db.database}?`}
        description="The database and its login are dropped, with all its data. Existing backups are kept. This cannot be undone."
        actions={
          <>
            <button type="button" className={btn.ghost} onClick={() => setRemoving(false)}>
              Cancel
            </button>
            <button type="button" className={btn.danger} disabled={busy} onClick={() => void remove()}>
              Delete database
            </button>
          </>
        }
      />
    </>
  );
}
