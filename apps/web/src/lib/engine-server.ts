import 'server-only';

// Server-side access to the engine and the registry. Route handlers in
// app/api call these; the engine token never leaves the server.

const engineUrl = () => process.env.ENGINE_URL ?? 'http://127.0.0.1:4100';

export function engineFetch(path: string, init: RequestInit = {}) {
  const token = process.env.ENGINE_TOKEN;
  if (!token) throw new Error('ENGINE_TOKEN is not set');
  return fetch(`${engineUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { ...init.headers, authorization: `Bearer ${token}` },
  });
}

export const registryHost = () => process.env.REGISTRY_HOST ?? 'localhost:5050';

export async function registryTags(repo: string): Promise<string[]> {
  const res = await fetch(`${process.env.REGISTRY_URL ?? 'http://127.0.0.1:5050'}/v2/${repo}/tags/list`, { cache: 'no-store' });
  if (!res.ok) return [];
  const body = (await res.json()) as { tags?: string[] | null };
  return (body.tags ?? []).sort().reverse();
}

/** Passes an SSE response from the engine straight to the browser. */
export function sse(body: ReadableStream<Uint8Array> | null) {
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
}
