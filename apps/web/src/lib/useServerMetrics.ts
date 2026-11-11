'use client';

import { useCallback, useEffect, useState } from 'react';

import { withMinimumSpin } from '@/components/RefreshButton';
import type { Range, ServerView } from './server-metrics';

/** The host samples once a minute; the page asks for fresh numbers at the same pace. */
const EVERY_MS = 60_000;

const CHANGED = 'gust:server-changed';

/**
 * Tells every mounted view of the server numbers (the Server page and the sidebar widget)
 * to load again now. Call it after anything that changes the host, such as a cleanup.
 */
export function announceServerChange() {
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * Loads the Server page data for a range, and again every minute while the tab is visible.
 * Also reloads when another view announces a change, so the sidebar widget and the page agree.
 */
export function useServerMetrics(range: Range) {
  const [data, setData] = useState<ServerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/server/metrics?range=${range}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as ServerView);
      setError(null);
    } catch {
      setError('Could not read the server metrics');
    }
  }, [range]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (!document.hidden) void load();
    }, EVERY_MS);
    window.addEventListener(CHANGED, load);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(CHANGED, load);
    };
  }, [load]);

  /** A manual refresh: shows `loading` until the numbers are in, and announces it to the other views. */
  const refresh = useCallback(async () => {
    setLoading(true);
    await withMinimumSpin(load());
    setLoading(false);
    announceServerChange();
  }, [load]);

  return { data, error, loading, refresh };
}
