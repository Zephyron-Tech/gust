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
 * Stops or starts one service's production by hand. Stop asks twice: the first click arms it,
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
      body: JSON.stringify({ action, target: 'production' }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) return notify(`${service} not ${action === 'stop' ? 'stopped' : 'started'}`, body?.error ?? 'Try again.', 'err');
    notify(
      action === 'stop' ? `${service} production stopped` : `${service} production starting`,
      action === 'stop' ? 'Its production containers are off; the worker will not restore them. Previews are not affected.' : undefined,
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

/** Stops or starts the production of every app service of a project. Admins only. */
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
      body: JSON.stringify({ action, target: 'production' }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { failed?: { service: string; error: string }[] } | null;
    if (!res?.ok && !body?.failed) return notify('Nothing changed', 'The request failed. Try again.', 'err');
    if (body?.failed?.length) notify('Some services did not move', body.failed.map((f) => `${f.service}: ${f.error}`).join(' · '), 'err');
    else notify(action === 'stop' ? `${project} production stopped` : `${project} production starting`, undefined, 'ok');
    router.refresh();
  }

  return (
    <button type="button" className={btn.secondary} disabled={busy} onClick={() => void run()}>
      {allStopped ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}
      {busy
        ? allStopped
          ? 'Starting…'
          : 'Stopping…'
        : allStopped
          ? 'Start production'
          : armed
            ? 'Really stop production?'
            : 'Stop production'}
    </button>
  );
}

/**
 * Stops or starts the previews of every app service of a project, apart from production.
 * Admins only. Shown in the Branches panel, next to the preview branches it controls.
 */
export function PreviewsPower({ project, previewsStopped }: { project: string; previewsStopped: boolean }) {
  const admin = useAdmin();
  const router = useRouter();
  const { notify } = useDemo();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!admin) return null;

  async function run() {
    if (!previewsStopped && !armed) return setArmed(true);
    setArmed(false);
    setBusy(true);
    const action = previewsStopped ? 'start' : 'stop';
    const res = await fetch(`/api/projects/${project}/power`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, target: 'previews' }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { failed?: { service: string; error: string }[] } | null;
    if (!res?.ok && !body?.failed) return notify('Nothing changed', 'The request failed. Try again.', 'err');
    if (body?.failed?.length) notify('Some previews did not move', body.failed.map((f) => `${f.service}: ${f.error}`).join(' · '), 'err');
    else
      notify(
        action === 'stop' ? 'Previews stopped' : 'Previews starting',
        action === 'stop' ? 'Preview hosts are off. Production keeps running. A new push to a preview branch still deploys it.' : undefined,
        'ok',
      );
    router.refresh();
  }

  return (
    <button type="button" className={btn.secondary} disabled={busy} onClick={() => void run()}>
      {previewsStopped ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}
      {busy
        ? previewsStopped
          ? 'Starting…'
          : 'Stopping…'
        : previewsStopped
          ? 'Start previews'
          : armed
            ? 'Really stop previews?'
            : 'Stop previews'}
    </button>
  );
}
