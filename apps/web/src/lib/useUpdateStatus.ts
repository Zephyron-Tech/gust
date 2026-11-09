'use client';

import { useCallback, useEffect, useState } from 'react';

import type { UpdateStatus } from './system-update-logic';

/** The status from GET /api/system/update, plus whether this user may act on it. */
export type UiUpdateStatus = UpdateStatus & { canManage: boolean };

/** Loads the update status now and then, so the sidebar badge stays current. */
export function useUpdateStatus() {
  const [status, setStatus] = useState<UiUpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return { status, error, reload };
}
