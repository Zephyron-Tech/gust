'use client';

import { ArrowCounterClockwise, Database, Plus } from '@phosphor-icons/react/ssr';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Ago } from '@/components/Ago';
import { DatabaseActions } from '@/components/DatabaseActions';
import { Select } from '@/components/Select';
import { btn, cx, Panel } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import type { BackupRow, DatabaseKind, DatabaseRow } from '@/lib/databases-db';
import { useDemo } from '@/lib/demo';

const field =
  'h-10 w-full rounded-[10px] border border-line bg-bg px-3 font-mono text-[14.5px] outline-none transition-colors focus:border-accent';

const WORD: Record<DatabaseRow['state'], { label: string; ink: string }> = {
  provisioning: { label: 'Creating', ink: 'text-warn' },
  ready: { label: 'Ready', ink: 'text-ok' },
  failed: { label: 'Failed', ink: 'text-err' },
  deleting: { label: 'Deleting', ink: 'text-warn' },
};

/** Databases of one project on the shared Postgres cluster or Redis: create, back up (Postgres), delete. */
export function DatabasesPanel({ slug, initial }: { slug: string; initial: { databases: DatabaseRow[]; backups: BackupRow[] } }) {
  const router = useRouter();
  const { notify } = useDemo();
  const { data: session } = authClient.useSession();
  const admin = (session?.user as { role?: string } | undefined)?.role === 'admin';
  const [name, setName] = useState('');
  const [kind, setKind] = useState<DatabaseKind>('postgres');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<{ file: string; name: string } | null>(null);

  const { databases, backups } = initial;
  const moving = databases.some((d) => d.state === 'provisioning' || d.state === 'deleting');
  // Same rule as planFor on the server: lowercase, runs of other characters become one underscore.
  const restoredDb = (name: string) =>
    `${slug}_${
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || '…'
    }`;

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
      body: JSON.stringify({ name, kind }),
    }).catch(() => null);
    setBusy(null);
    const body = (await res?.json().catch(() => null)) as { error?: string; database?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? 'Could not reach Gust. Nothing was created. Try again.');
      return;
    }
    setName('');
    notify(
      `Creating ${body?.database ?? 'database'}`,
      `The worker makes the ${kind === 'redis' ? 'Redis user' : 'database and its login'}, then sets ${kind === 'redis' ? 'REDIS_URL' : 'DATABASE_URL'} on the app.`,
    );
    router.refresh();
  }

  async function restore(file: string, name: string) {
    setError(null);
    setBusy('restore');
    const res = await fetch(`/api/projects/${slug}/databases/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file, name }),
    }).catch(() => null);
    setBusy(null);
    const body = (await res?.json().catch(() => null)) as { error?: string; database?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? 'Could not reach Gust. Nothing was restored. Try again.');
      return;
    }
    setRestoring(null);
    notify(
      `Restoring into ${body?.database ?? 'a new database'}`,
      'The worker creates it and loads the dump. It appears as Ready when done.',
    );
    router.refresh();
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
              <span className="font-mono text-[13px]">DATABASE_URL</span> (Postgres) or{' '}
              <span className="font-mono text-[13px]">REDIS_URL</span> (Redis), with{' '}
              <span className="font-mono text-[13px]">_&lt;NAME&gt;</span> added for any but the first. Redeploy the app to pick it up.
            </p>
          </div>
        </div>

        {admin ? (
          <form onSubmit={create} className="mt-5 flex flex-wrap items-end gap-3">
            <div className="w-[160px] space-y-1.5">
              <span className="text-[13.5px] text-fg-2">Type</span>
              <Select
                label="Type"
                value={kind}
                onValueChange={(v) => setKind(v as DatabaseKind)}
                options={[
                  { value: 'postgres', label: 'Postgres' },
                  { value: 'redis', label: 'Redis' },
                ]}
              />
            </div>
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
              {kind === 'redis' ? (
                <>
                  Redis keys under <span className="font-mono">{slug}_&lt;name&gt;:</span>, reachable with its own login only. A backup
                  copies those keys.
                </>
              ) : (
                <>
                  Becomes <span className="font-mono">{slug}_&lt;name&gt;</span> on the cluster. Letters, digits and dashes.
                </>
              )}
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
                  {d.kind === 'redis' && <span className="text-[13px] text-fg-3">Redis</span>}
                  <span className={cx('text-[13px]', WORD[d.state].ink)}>{WORD[d.state].label}</span>
                </p>
                <p className="truncate font-mono text-[13px] text-fg-3">{d.database}</p>
                {d.error && <p className="mt-1 text-[13.5px] text-err">{d.error}</p>}
              </div>
              <span className="text-[13px] text-fg-3">
                <Ago iso={new Date(d.createdAt).toISOString()} />
              </span>
              {admin && <DatabaseActions slug={slug} db={d} />}
            </div>
          ))
        )}
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display text-[17px]">Backups</h2>
        {backups.length === 0 ? (
          <p className="mt-3 text-[14px] text-fg-3">
            No backups yet. A backup is a dump in the backups folder on the server: Postgres as a custom-format dump, Redis as its keys.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {backups.map((b, i) => (
              <li key={`${b.file}-${i}`} className="py-3 text-[14px]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-[13px] text-fg-2">{b.file || b.database}</span>
                  <span className="flex items-center gap-3 text-fg-3">
                    <Ago iso={new Date(b.at).toISOString()} />
                    {admin && b.file && (
                      <button
                        type="button"
                        className={btn.ghost}
                        disabled={busy !== null}
                        onClick={() => setRestoring({ file: b.file, name: `${b.name || 'main'}-restored` })}
                      >
                        <ArrowCounterClockwise /> Restore
                      </button>
                    )}
                  </span>
                </div>
                {admin && restoring?.file === b.file && (
                  <form
                    className="mt-3 flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void restore(restoring.file, restoring.name);
                    }}
                  >
                    <label className="min-w-[200px] flex-1 space-y-1.5">
                      <span className="text-[13.5px] text-fg-2">New database name</span>
                      <input
                        className={field}
                        value={restoring.name}
                        onChange={(e) => setRestoring({ ...restoring, name: e.target.value })}
                        maxLength={40}
                        required
                      />
                    </label>
                    <button type="submit" className={btn.primary} disabled={busy !== null || restoring.name.trim() === ''}>
                      {busy === 'restore' ? 'Sending…' : 'Restore to new database'}
                    </button>
                    <button type="button" className={btn.ghost} onClick={() => setRestoring(null)}>
                      Cancel
                    </button>
                    <p className="w-full text-[13px] text-fg-3">
                      Creates <span className="font-mono">{restoredDb(restoring.name || '…')}</span>. The current database is not touched.
                    </p>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
