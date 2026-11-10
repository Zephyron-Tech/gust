'use client';

import { Database, DownloadSimple, Plus, Trash } from '@phosphor-icons/react/ssr';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Ago } from '@/components/Ago';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { btn, cx, Panel } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import type { BackupRow, DatabaseRow } from '@/lib/databases-db';
import { useDemo } from '@/lib/demo';

const field =
  'h-10 w-full rounded-[10px] border border-line bg-bg px-3 font-mono text-[14.5px] outline-none transition-colors focus:border-accent';

const WORD: Record<DatabaseRow['state'], { label: string; ink: string }> = {
  provisioning: { label: 'Creating', ink: 'text-warn' },
  ready: { label: 'Ready', ink: 'text-ok' },
  failed: { label: 'Failed', ink: 'text-err' },
  deleting: { label: 'Deleting', ink: 'text-warn' },
};

/** Postgres databases of one project on the shared cluster: create, back up, delete. */
export function DatabasesPanel({ slug, initial }: { slug: string; initial: { databases: DatabaseRow[]; backups: BackupRow[] } }) {
  const router = useRouter();
  const { notify } = useDemo();
  const { data: session } = authClient.useSession();
  const admin = (session?.user as { role?: string } | undefined)?.role === 'admin';
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<DatabaseRow | null>(null);

  const { databases, backups } = initial;
  const moving = databases.some((d) => d.state === 'provisioning' || d.state === 'deleting');

  // Re-reads the server while a create or delete is still running.
  useEffect(() => {
    if (!moving) return;
    const id = window.setInterval(() => router.refresh(), 2000);
    return () => window.clearInterval(id);
  }, [moving, router]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy('create');
    const res = await fetch(`/api/projects/${slug}/databases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    setBusy(null);
    const body = (await res?.json().catch(() => null)) as { error?: string; database?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? 'Could not reach Gust. Nothing was created. Try again.');
      return;
    }
    setName('');
    notify(`Creating ${body?.database ?? 'database'}`, 'The worker makes the database and its login, then sets DATABASE_URL on the app.');
    router.refresh();
  }

  async function remove(d: DatabaseRow) {
    setBusy(d.id);
    const res = await fetch(`/api/projects/${slug}/databases/${d.id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(null);
    setRemoving(null);
    if (!res?.ok) {
      notify('Delete failed', 'Gust did not accept the request. Try again.', 'err');
      return;
    }
    notify(`Deleting ${d.database}`, 'The database and its login are dropped by the worker. Backups stay.');
    router.refresh();
  }

  async function backup(d: DatabaseRow) {
    setBusy(d.id);
    const res = await fetch(`/api/projects/${slug}/databases/${d.id}/backup`, { method: 'POST' }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      notify('Backup not started', 'Gust did not accept the request. Try again.', 'err');
      return;
    }
    notify(`Backup of ${d.database} queued`, 'It appears in the list when the dump is written.');
    router.refresh();
    // The worker writes the audit row after the dump; refresh again once it is likely done.
    window.setTimeout(() => router.refresh(), 4000);
  }

  return (
    <div className="space-y-6">
      <Panel className="p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-bg-3 text-fg-2">
            <Database size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[17px]">Databases</h2>
            <p className="mt-1 text-[14px] text-fg-3">
              Each database gets its own login and nothing else can reach it. The connection string is set on the app as{' '}
              <span className="font-mono text-[13px]">DATABASE_URL</span> (the first one) or{' '}
              <span className="font-mono text-[13px]">DATABASE_URL_&lt;NAME&gt;</span>. Redeploy the app to pick it up.
            </p>
          </div>
        </div>

        {admin ? (
          <form onSubmit={create} className="mt-5 flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 space-y-1.5">
              <span className="text-[13.5px] text-fg-2">Name</span>
              <input
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="main"
                maxLength={40}
                required
                aria-describedby="db-name-hint"
              />
            </label>
            <button type="submit" className={btn.primary} disabled={busy !== null || name.trim() === ''}>
              <Plus weight="bold" /> {busy === 'create' ? 'Sending…' : 'Create database'}
            </button>
            <p id="db-name-hint" className="w-full text-[13px] text-fg-3">
              Becomes <span className="font-mono">{slug}_&lt;name&gt;</span> on the cluster. Letters, digits and dashes.
            </p>
          </form>
        ) : (
          <p className="mt-5 text-[14px] text-fg-3">Only admins can create, back up or delete databases.</p>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-err/30 bg-err/10 p-3 text-[14px] text-err">
            {error}
          </p>
        )}
      </Panel>

      <Panel className="overflow-hidden">
        {databases.length === 0 ? (
          <p className="px-6 py-8 text-center text-[14.5px] text-fg-3">No databases yet.</p>
        ) : (
          databases.map((d, i) => (
            <div key={d.id} className={cx('flex flex-wrap items-center gap-4 px-5 py-4', i > 0 && 'border-t border-line')}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="font-medium">{d.name}</span>
                  <span className={cx('text-[13px]', WORD[d.state].ink)}>{WORD[d.state].label}</span>
                </p>
                <p className="truncate font-mono text-[13px] text-fg-3">{d.database}</p>
                {d.error && <p className="mt-1 text-[13.5px] text-err">{d.error}</p>}
              </div>
              <span className="text-[13px] text-fg-3">
                <Ago iso={new Date(d.createdAt).toISOString()} />
              </span>
              {admin && (
                <div className="flex gap-2">
                  {d.state === 'ready' && (
                    <button type="button" className={btn.secondary} disabled={busy !== null} onClick={() => void backup(d)}>
                      <DownloadSimple /> Back up
                    </button>
                  )}
                  {d.state !== 'provisioning' && d.state !== 'deleting' && (
                    <button type="button" className={btn.ghost} disabled={busy !== null} onClick={() => setRemoving(d)}>
                      <Trash /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display text-[17px]">Backups</h2>
        {backups.length === 0 ? (
          <p className="mt-3 text-[14px] text-fg-3">
            No backups yet. A backup is a Postgres custom-format dump in the backups folder on the server.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {backups.map((b, i) => (
              <li key={`${b.file}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[14px]">
                <span className="font-mono text-[13px] text-fg-2">{b.file || b.database}</span>
                <span className="text-fg-3">
                  <Ago iso={new Date(b.at).toISOString()} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        title={`Delete ${removing?.database ?? 'database'}?`}
        description="The database and its login are dropped, with all its data. Existing backups are kept. This cannot be undone."
        actions={
          <>
            <button type="button" className={btn.ghost} onClick={() => setRemoving(null)}>
              Cancel
            </button>
            <button type="button" className={btn.danger} disabled={busy !== null} onClick={() => removing && void remove(removing)}>
              Delete database
            </button>
          </>
        }
      />
    </div>
  );
}
