'use client';

import { WarningCircle } from '@phosphor-icons/react/ssr';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useDemo } from '@/lib/demo';
import { btn } from './ui';

/**
 * Deletes one image by digest after a confirmation. The digest may carry more tags; they go too,
 * and the confirmation says which.
 */
export function RegistryTagDelete({ repo, tag, digest, alsoTags }: { repo: string; tag: string; digest: string; alsoTags: string[] }) {
  const router = useRouter();
  const { notify } = useDemo();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/registry/tags', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo, digest }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Could not reach the server. Try again.');
      return;
    }
    notify(`Deleted ${tag}.`, undefined, 'ok');
    setAsking(false);
    router.refresh();
  }

  if (!asking) {
    return (
      <button type="button" className={btn.danger} onClick={() => setAsking(true)}>
        Delete
      </button>
    );
  }

  return (
    <div className="max-w-md space-y-3 text-left">
      <p className="flex items-start gap-2 text-[13.5px] text-err">
        <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
        <span>
          Delete <span className="font-mono">{tag}</span>? Rollback to this version will no longer work. The image is removed after the next
          registry cleanup (about an hour).
          {alsoTags.length > 0 && (
            <>
              {' '}
              The same image also has{' '}
              {alsoTags.map((t, i) => (
                <span key={t}>
                  {i > 0 && ', '}
                  <span className="font-mono">{t}</span>
                </span>
              ))}
              , which go too.
            </>
          )}
        </span>
      </p>
      {error && <p className="text-[13.5px] text-err">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className={btn.danger} disabled={busy} onClick={remove}>
          {busy ? 'Deleting…' : 'Delete tag'}
        </button>
        <button type="button" className={btn.ghost} disabled={busy} onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
