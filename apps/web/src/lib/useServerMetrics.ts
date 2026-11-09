'use client';

import { useCallback, useEffect, useState } from 'react';

import type { Range, ServerView } from './server-metrics';

/** The host samples once a minute; the page asks for fresh numbers at the same pace. */
const EVERY_MS = 60_000;

/** Loads the Server page data for a range, and again every minute while the tab is visible. */
export function useServerMetrics(range: Range) {
  const [data, setData] = useState<ServerView | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    return () => window.clearInterval(id);
  }, [load]);

  return { data, error };
}
