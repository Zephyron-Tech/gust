'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useDemo } from '@/lib/demo';
import { type AccountView, isJobDone, type Outcome, outcome, type RegistryAction } from '@/lib/registry-action';

const POLL_MS = 3_000;
const GIVE_UP_MS = 90_000;

export type Banner = Outcome | { tone: 'info'; text: string };

/**
 * Runs one registry action and follows it to the end: the buttons stay locked while the worker
 * works, the status is refreshed every few seconds, and the result becomes a banner.
 */
export function useRegistryJob(slug: string, status: AccountView) {
  const router = useRouter();
  const { notify } = useDemo();
  const [busy, setBusy] = useState<RegistryAction | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const before = useRef<AccountView>(null);
  const reactivating = useRef(false);
  const current = useRef(status);
  current.current = status;

  async function act(action: RegistryAction, opts: { reactivate?: boolean } = {}) {
    if (busy) return;
    setBusy(action);
    setBanner(null);
    before.current = current.current;
    reactivating.current = opts.reactivate ?? false;
    const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/registry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setBusy(null);
      setBanner({ tone: 'err', text: body?.error ?? 'Could not reach the server. Try again.' });
      return;
    }
    router.refresh();
  }

  // While a job runs: refresh the status every few seconds, and give up after a while.
  useEffect(() => {
    if (!busy) return;
    const poll = setInterval(() => router.refresh(), POLL_MS);
    const giveUp = setTimeout(() => {
      setBusy(null);
      setBanner({ tone: 'info', text: 'Still running. Reload the page in a minute to see the result.' });
    }, GIVE_UP_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [busy, router]);

  // The status changed: the job is done when its result is in.
  useEffect(() => {
    if (!busy || !isJobDone(before.current, status, busy)) return;
    const result = outcome(status, busy, reactivating.current);
    setBusy(null);
    setBanner(result);
    notify(result.text, undefined, result.tone === 'ok' ? 'ok' : 'err');
  }, [status, busy, notify]);

  return { busy, banner, act };
}
