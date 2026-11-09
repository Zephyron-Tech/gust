'use client';

import { Trash } from '@phosphor-icons/react/ssr';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';
import { btn, Code, Panel } from './ui';

const field =
  'h-10 w-full rounded-[10px] border border-line bg-bg px-3 font-mono text-[13.5px] outline-none transition-colors focus:border-err';

/**
 * Deletes the whole project, not only this service. Admins only. The name has to
 * be typed, because the deletion stops every container and removes every deploy.
 */
export function DeleteProject({ slug, services }: { slug: string; services: string[] }) {
  const router = useRouter();
  const { notify } = useDemo();
  const { data: session } = authClient.useSession();
  const admin = (session?.user as { role?: string } | undefined)?.role === 'admin';

  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  if (!admin) return null;

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/projects/${slug}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: typed }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string; volumesKept?: string[] } | null;
    if (!res?.ok) {
      setBusy(false);
      return notify('Project not deleted', body?.error ?? 'Try again in a moment.', 'err');
    }
    notify('Project deleted', body?.volumesKept?.length ? `Data volumes kept: ${body.volumesKept.join(', ')}` : undefined, 'ok');
    router.push('/projects');
  }

  return (
    <Panel className="view-in max-w-3xl border-err/30 p-7">
      <h2 className="font-display text-[17px] font-semibold tracking-tight text-err">Delete project</h2>
      <p className="mt-2 text-[13.5px] text-fg-3">
        Stops every container of <Code className="text-fg-2">{slug}</Code> and removes{' '}
        {services.length > 1 ? 'its services' : 'the service'} ({services.join(', ')}) from Gust, with their deploys, env variables, domains
        and logs. The audit log keeps a record.
      </p>
      <p className="mt-2 text-[13.5px] text-fg-3">
        Kept: the images in the registry, stateful data volumes with their nightly backups, and the GitHub repository and its workflow.
        After deleting, a push from the workflow is refused.
      </p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="min-w-[240px] flex-1 space-y-1">
          <span className="text-[13px] text-fg-3">
            Type <span className="font-mono text-fg-2">{slug}</span> to confirm
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className={field}
            autoComplete="off"
            spellCheck={false}
            aria-label="Project name to confirm"
          />
        </label>
        <button type="button" disabled={busy || typed !== slug} onClick={remove} className={btn.danger}>
          <Trash /> {busy ? 'Deleting…' : 'Delete project'}
        </button>
      </div>
    </Panel>
  );
}
