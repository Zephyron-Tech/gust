const engineUrl = () => process.env.ENGINE_URL ?? 'http://127.0.0.1:4100';

export function engineFetch(path: string, init: RequestInit = {}) {
  const token = process.env.ENGINE_TOKEN;
  if (!token) throw new Error('ENGINE_TOKEN is not set');
  return fetch(`${engineUrl()}${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } });
}

export const registryHost = () => process.env.REGISTRY_HOST ?? 'localhost:5050';
