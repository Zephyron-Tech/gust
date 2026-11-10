'use client';

import { ArrowsClockwise, Trash, UploadSimple } from '@phosphor-icons/react/ssr';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';
import { ProjectIcon } from './ProjectIcon';
import { btn, Panel } from './ui';

const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.ico,.svg,image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon';

/**
 * The project's icon in lists and the sidebar. Gust takes it from the site's
 * favicon by itself; an admin can upload another, take the site's again, or remove it.
 */
export function ProjectIconPanel({ slug, icon, domain }: { slug: string; icon: string | null; domain: string }) {
  const router = useRouter();
  const { notify } = useDemo();
  const { data: session } = authClient.useSession();
  const admin = (session?.user as { role?: string } | undefined)?.role === 'admin';
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'site' | 'remove' | null>(null);

  async function send(action: 'upload' | 'site' | 'remove', init: RequestInit) {
    setBusy(action);
    const res = await fetch(`/api/projects/${slug}/icon`, init).catch(() => null);
    setBusy(null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) return notify('Icon not changed', body?.error ?? 'Try again in a moment.', 'err');
    notify(action === 'remove' ? 'Icon removed' : 'Icon saved');
    router.refresh();
  }

  return (
    <Panel className="view-in flex max-w-3xl flex-col gap-5 p-6 sm:flex-row sm:items-center">
      <ProjectIcon slug={slug} src={icon} />
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[16px] font-semibold tracking-tight">Icon</h3>
        <p className="mt-1 text-[14px] text-fg-2">
          {icon
            ? 'Shown next to the project name in the list and the sidebar.'
            : 'No icon yet. Gust takes the favicon of the live site when it has one, then shows the first letter.'}
          {!icon && domain && <span className="font-mono text-[12.5px] text-fg-3"> · {domain}</span>}
        </p>
      </div>
      {admin && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              const form = new FormData();
              form.append('file', file);
              void send('upload', { method: 'PUT', body: form });
            }}
          />
          <button type="button" className={btn.secondary} disabled={busy !== null} onClick={() => input.current?.click()}>
            <UploadSimple weight="bold" /> {busy === 'upload' ? 'Uploading…' : 'Upload'}
          </button>
          <button type="button" className={btn.ghost} disabled={busy !== null} onClick={() => void send('site', { method: 'POST' })}>
            <ArrowsClockwise weight="bold" /> {busy === 'site' ? 'Taking…' : 'Take from site'}
          </button>
          {icon && (
            <button type="button" className={btn.ghost} disabled={busy !== null} onClick={() => void send('remove', { method: 'DELETE' })}>
              <Trash weight="bold" /> Remove
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
