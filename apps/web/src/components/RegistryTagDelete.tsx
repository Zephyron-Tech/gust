'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useDemo } from '@/lib/demo';
import { ConfirmDialog } from './ConfirmDialog';
import { btn, Code } from './ui';

/**
 * Deletes one image by digest after a confirmation dialog. The digest may carry more tags; they go
 * too, and the dialog lists them.
 */
export function RegistryTagDelete({ repo, tag, digest, alsoTags }: { repo: string; tag: string; digest: string; alsoTags: string[] }) {
  const router = useRouter();
  const { notify } = useDemo();
  const [open, setOpen] = useState(false);
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
    notify(`Deleted ${tag}`, undefined, 'ok');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className={btn.danger} onClick={() => setOpen(true)}>
        Delete
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => !busy && setOpen(next)}
        title="Delete this image?"
        description={
          <>
            <Code className="text-fg">{tag}</Code> is removed from <Code className="text-fg">{repo}</Code>. Rollback to this version will no
            longer work. The image is removed after the next registry cleanup (about an hour).
            {alsoTags.length > 0 && (
              <>
                {' '}
                The same image also has{' '}
                {alsoTags.map((t, i) => (
                  <span key={t}>
                    {i > 0 && ', '}
                    <Code className="text-fg">{t}</Code>
                  </span>
                ))}
                , which go too.
              </>
            )}
            {error && <span className="mt-3 block text-err">{error}</span>}
          </>
        }
        actions={
          <>
            <button type="button" className={btn.ghost} disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className={btn.danger} disabled={busy} onClick={remove}>
              {busy ? 'Deleting…' : 'Delete image'}
            </button>
          </>
        }
      />
    </>
  );
}
