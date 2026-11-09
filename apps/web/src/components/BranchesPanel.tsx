'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';
import { btn, Code, Panel } from './ui';

const field =
  'h-10 w-full rounded-[10px] border border-line bg-bg px-3 font-mono text-[13.5px] outline-none transition-colors focus:border-accent';

/**
 * Production and preview branches of a project. Anyone signed in can read them;
 * admins can change them. Pushes to these branches deploy by themselves.
 */
export function BranchesPanel({
  slug,
  productionBranch,
  previewBranches,
  previewUrls,
}: {
  slug: string;
  productionBranch: string;
  previewBranches: string[];
  /** Public URL of each preview branch, when the server knows the domain. */
  previewUrls: Record<string, string>;
}) {
  const router = useRouter();
  const { notify } = useDemo();
  const { data: session } = authClient.useSession();
  const admin = (session?.user as { role?: string } | undefined)?.role === 'admin';

  const [editing, setEditing] = useState(false);
  const [production, setProduction] = useState(productionBranch);
  const [previews, setPreviews] = useState(previewBranches.join(', '));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/projects/${slug}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productionBranch: production.trim(),
        previewBranches: previews
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean),
      }),
    }).catch(() => null);
    setSaving(false);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) return notify('Not saved', body?.error ?? 'Check the branch names and try again.', 'err');
    notify('Branches saved', 'Pushes to these branches deploy from now on.', 'ok');
    setEditing(false);
    router.refresh();
  }

  return (
    <Panel className="view-in max-w-3xl p-7">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[17px] font-semibold tracking-tight">Branches</h2>
          <p className="mt-1 text-[13.5px] text-fg-3">Pushes to these branches deploy by themselves. Each preview gets its own host.</p>
        </div>
        {admin && !editing && (
          <button type="button" onClick={() => setEditing(true)} className={btn.secondary}>
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="grid grid-cols-[180px_1fr] gap-x-8 gap-y-4 text-[14.5px]">
          <dt className="text-fg-3">Production</dt>
          <dd>
            <Code className="text-fg-2">{productionBranch}</Code>
            <span className="ml-2 text-fg-3">→ production</span>
          </dd>
          <dt className="text-fg-3">Previews</dt>
          <dd className="space-y-2">
            {previewBranches.length === 0 && <span className="text-fg-3">None</span>}
            {previewBranches.map((b) => (
              <div key={b} className="flex flex-wrap items-center gap-2">
                <Code className="text-fg-2">{b}</Code>
                {previewUrls[b] ? (
                  <a href={previewUrls[b]} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {previewUrls[b].replace(/^https:\/\//, '')}
                  </a>
                ) : null}
              </div>
            ))}
          </dd>
        </dl>
      ) : (
        <form
          className="grid max-w-xl gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="grid gap-1.5 text-[14px]">
            <span className="text-fg-2">Production branch</span>
            <input className={field} value={production} onChange={(e) => setProduction(e.target.value)} required />
            <span className="text-[13px] text-fg-3">Pushes here deploy to production.</span>
          </label>
          <label className="grid gap-1.5 text-[14px]">
            <span className="text-fg-2">Preview branches</span>
            <input className={field} value={previews} onChange={(e) => setPreviews(e.target.value)} placeholder="dev, staging" />
            <span className="text-[13px] text-fg-3">Comma-separated, up to 10. Pushes here deploy a preview on their own host.</span>
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className={btn.primary}>
              {saving ? 'Saving…' : 'Save branches'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setProduction(productionBranch);
                setPreviews(previewBranches.join(', '));
              }}
              className={btn.ghost}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}
