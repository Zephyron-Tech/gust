'use client';

import { Pause, Play } from '@phosphor-icons/react/ssr';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';
import { btn } from './ui';

function useAdmin() {
  const { data: session } = authClient.useSession();
  return (session?.user as { role?: string } | undefined)?.role === 'admin';
}

/**
 * Stops or starts one service by hand. Stop asks twice: the first click arms it,
 * the second stops. Admins only; viewers see nothing.
 */
export function ServicePower({ project, service, stopped }: { project: string; service: string; stopped: boolean }) {
  const admin = useAdmin();
  const router = useRouter();
  const { notify } = useDemo();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!admin) return null;

  async function run() {
    if (!stopped && !armed) return setArmed(true);
    setArmed(false);
    setBusy(true);
    const action = stopped ? 'start' : 'stop';
    const res = await fetch(`/api/projects/${project}/${service}/power`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) return notify(`${service} not ${action === 'stop' ? 'stopped' : 'started'}`, body?.error ?? 'Try again.', 'err');
    notify(
      action === 'stop' ? `${service} stopped` : `${service} starting`,
      action === 'stop' ? 'Its containers are off; the worker will not restore them.' : undefined,
      'ok',
    );
    router.refresh();
  }

  return (
    <button type="button" className={btn.secondary} disabled={busy} onClick={() => void run()}>
      {stopped ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}
      {busy ? (stopped ? 'Starting…' : 'Stopping…') : stopped ? 'Start' : armed ? 'Really stop?' : 'Stop'}
    </button>
  );
}

/** Stops or starts every app service of a project. Admins only. */
export function ProjectPower({ project, allStopped }: { project: string; allStopped: boolean }) {
  const admin = useAdmin();
  const router = useRouter();
  const { notify } = useDemo();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!admin) return null;

  async function run() {
    if (!allStopped && !armed) return setArmed(true);
    setArmed(false);
    setBusy(true);
    const action = allStopped ? 'start' : 'stop';
    const res = await fetch(`/api/projects/${project}/power`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { failed?: { service: string; error: string }[] } | null;
    if (!res?.ok && !body?.failed) return notify('Nothing changed', 'The request failed. Try again.', 'err');
    if (body?.failed?.length) notify('Some services did not move', body.failed.map((f) => `${f.service}: ${f.error}`).join(' · '), 'err');
    else notify(action === 'stop' ? `${project} stopped` : `${project} starting`, undefined, 'ok');
    router.refresh();
  }

  return (
    <button type="button" className={btn.secondary} disabled={busy} onClick={() => void run()}>
      {allStopped ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}
      {busy ? (allStopped ? 'Starting…' : 'Stopping…') : allStopped ? 'Start project' : armed ? 'Really stop project?' : 'Stop project'}
    </button>
  );
}
