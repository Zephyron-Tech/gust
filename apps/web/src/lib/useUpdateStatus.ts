'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { UpdateStatus } from './system-update-logic';

/** The status from GET /api/system/update, plus whether this user may act on it. */
export type UiUpdateStatus = UpdateStatus & { canManage: boolean };

/** A background check runs on page load only when the last one is older than this. */
const CHECK_AFTER_MS = 5 * 60_000;

/**
 * Loads the update status now and then, so the sidebar badge stays current.
 * With autoCheck, an admin's first load also asks the host for a fresh check
 * when the last one is stale, so the badge is right when a new tab opens.
 */
export function useUpdateStatus({ autoCheck = false }: { autoCheck?: boolean } = {}) {
  const [status, setStatus] = useState<UiUpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const askedRef = useRef(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/system/update', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setStatus((await res.json()) as UiUpdateStatus);
      setError(null);
    } catch {
      setError('Could not read the update status');
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => {
      if (!document.hidden) void reload();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [reload]);

  useEffect(() => {
    if (!autoCheck || askedRef.current || !status?.canManage || status.state === 'running') return;
    const last = status.checkedAt ? Date.parse(status.checkedAt) : 0;
    if (Date.now() - last < CHECK_AFTER_MS) return;
    askedRef.current = true;
    // The host checks in the background; the 60 s poll above picks up the result.
    // A 409 (a check or install is already running) is fine to ignore.
    void fetch('/api/system/update/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ auto: true }),
    }).catch(() => undefined);
  }, [autoCheck, status]);

  return { status, error, reload };
}
