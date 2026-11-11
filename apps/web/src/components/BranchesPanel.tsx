'use client';

import type { Environment } from '@gust/contracts';
import { ArrowSquareOut } from '@phosphor-icons/react/ssr';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';
import { EnvBadge } from './EnvBadge';
import { PreviewsPower } from './PowerControls';
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
  productionDomains,
  previewsStopped,
  githubRepo,
  pullRequests,
}: {
  slug: string;
  /** owner/name on GitHub, to link the pull requests. */
  githubRepo: string | null;
  /** Open pull requests with a live preview. */
  pullRequests: { number: number; title: string; author: string; host: string | null }[];
  productionBranch: string;
  previewBranches: string[];
  /** Previews are stopped by hand; production is not affected. */
  previewsStopped: boolean;
  /** Hosts production is served on. */
  productionDomains: string[];
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
        <div className="flex shrink-0 items-center gap-2">
          {previewBranches.length > 0 && <PreviewsPower project={slug} previewsStopped={previewsStopped} />}
          {admin && !editing && (
            <button type="button" onClick={() => setEditing(true)} className={btn.secondary}>
              Edit
            </button>
          )}
        </div>
      </div>
      {!editing ? (
        <ul className="divide-y divide-line rounded-xl border border-line text-[14.5px]">
          <BranchRow branch={productionBranch} env={{ kind: 'production' }} hosts={productionDomains} />
          {previewBranches.map((b) => (
            <BranchRow
              key={b}
              branch={b}
              env={{ kind: 'preview', branch: b }}
              hosts={previewUrls[b] ? [previewUrls[b].replace(/^https:\/\//, '')] : []}
              paused={previewsStopped}
            />
          ))}
          {previewBranches.length === 0 && (
            <li className="px-4 py-3 text-[14px] text-fg-3">No preview branches. Add one to deploy it on its own host.</li>
          )}
        </ul>
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
      {!editing && pullRequests.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-[13.5px] font-medium text-fg-2">Pull requests with a preview</h3>
          <ul className="divide-y divide-line rounded-xl border border-line text-[14.5px]">
            {pullRequests.map((pr) => (
              <li key={pr.number} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                {githubRepo ? (
                  <a
                    href={`https://github.com/${githubRepo}/pull/${pr.number}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[13.5px] text-fg hover:text-accent"
                  >
                    #{pr.number}
                  </a>
                ) : (
                  <Code className="text-fg">#{pr.number}</Code>
                )}
                <span className="min-w-0 truncate text-fg-2">
                  {pr.title} <span className="text-fg-3">· {pr.author}</span>
                </span>
                {pr.host && (
                  <a
                    href={`https://${pr.host}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 truncate text-[14px] text-fg-2 transition-colors hover:text-accent"
                  >
                    {pr.host} <ArrowSquareOut size={14} className="shrink-0 text-fg-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/** One branch: its name, the environment it deploys to and where that is served. */
function BranchRow({ branch, env, hosts, paused = false }: { branch: string; env: Environment; hosts: string[]; paused?: boolean }) {
  const [first, ...rest] = hosts;
  return (
    <li className="grid grid-cols-[minmax(0,140px)_auto_minmax(0,1fr)] items-center gap-4 px-4 py-3">
      <Code className="truncate text-fg">{branch}</Code>
      <span className="flex items-center gap-2">
        <EnvBadge env={env} />
        {paused && <span className="text-[13px] text-fg-3">stopped</span>}
      </span>
      <span className="min-w-0 truncate text-right text-[14px]">
        {first ? (
          <>
            <a
              href={`https://${first}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-fg-2 transition-colors hover:text-accent"
            >
              {first} <ArrowSquareOut size={14} className="shrink-0 text-fg-3" />
            </a>
            {rest.length > 0 && <span className="ml-2 text-fg-3">+{rest.length}</span>}
          </>
        ) : (
          <span className="text-fg-3">{env.kind === 'production' ? 'No domain yet' : 'Host appears once GUST_DOMAIN is set'}</span>
        )}
      </span>
    </li>
  );
}
