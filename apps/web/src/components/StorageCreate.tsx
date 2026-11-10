'use client';

import { Plus } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { btn, Panel } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';

const field =
  'h-10 w-full rounded-[10px] border border-line bg-bg px-3 font-mono text-[14.5px] outline-none transition-colors focus:border-accent';

export type StorageTarget = { slug: string; service: string };

/** Creates a database for a chosen project from the Storage page. Admins only. */
export function StorageCreate({ targets }: { targets: StorageTarget[] }) {
  const router = useRouter();
  const { notify } = useDemo();
  const { data: session } = authClient.useSession();
  const admin = (session?.user as { role?: string } | undefined)?.role === 'admin';
  const [project, setProject] = useState(targets[0]?.slug ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!admin) return null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/projects/${project}/databases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { error?: string; database?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? 'Could not reach Gust. Nothing was created. Try again.');
      return;
    }
    setName('');
    notify(`Creating ${body?.database ?? 'database'}`, 'The worker makes the database and its login, then sets DATABASE_URL on the app.');
    router.refresh();
  }

  if (targets.length === 0) {
    return (
      <Panel className="px-6 py-5 text-[14.5px] text-fg-3">
        A database needs a project with an app service. Add one from Projects first.
      </Panel>
    );
  }

  const target = targets.find((t) => t.slug === project);

  return (
    <Panel className="p-5">
      <form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <label className="min-w-[200px] flex-1 space-y-1.5">
          <span className="text-[13.5px] text-fg-2">Project</span>
          <select className={field} value={project} onChange={(e) => setProject(e.target.value)}>
            {targets.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.slug}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[200px] flex-1 space-y-1.5">
          <span className="text-[13.5px] text-fg-2">Name</span>
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="main"
            maxLength={40}
            required
            aria-describedby="storage-db-hint"
          />
        </label>
        <button type="submit" className={btn.primary} disabled={busy || name.trim() === ''}>
          <Plus weight="bold" /> {busy ? 'Sending…' : 'Create database'}
        </button>
      </form>
      <p id="storage-db-hint" className="mt-3 text-[13px] text-fg-3">
        Becomes <span className="font-mono">{project}_&lt;name&gt;</span> on the cluster. Letters, digits and dashes. Manage it on{' '}
        {target && (
          <Link href={`/projects/${target.slug}/${target.service}/databases`} className="text-fg-2 underline-offset-2 hover:underline">
            {target.slug} · Databases
          </Link>
        )}
        .
      </p>
      {error && (
        <p role="alert" className="mt-3 text-[14px] text-err">
          {error}
        </p>
      )}
    </Panel>
  );
}
