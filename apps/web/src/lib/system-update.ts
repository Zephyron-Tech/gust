import 'server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { decide, parseStatus, type RequestKind, tailLog, type UpdateStatus } from './system-update-logic';

// The host runs `gust requests-run` and `gust version-check` (systemd) and keeps
// this folder up to date. The web container only writes request files here and
// reads status.json, so it never needs the Docker socket.
const dir = () => process.env.GUST_REQUESTS_DIR ?? '/gust-requests';

/** The last status the host wrote; the log only when asked (admins). */
export async function readUpdateStatus(withLog: boolean): Promise<UpdateStatus> {
  const raw = await fs.readFile(path.join(dir(), 'status.json'), 'utf8').catch(() => null);
  const status = parseStatus(raw);
  if (withLog) {
    status.log = await fs
      .readFile(path.join(dir(), 'update.log'), 'utf8')
      .then(tailLog)
      .catch(() => '');
  }
  return status;
}

export type RequestResult = { ok: true } | { ok: false; status: number; error: string };

/** Queues a request file for the host. The host removes it when it runs. */
export async function requestUpdate(kind: RequestKind): Promise<RequestResult> {
  const status = await readUpdateStatus(false);
  const verdict = decide(kind, status);
  if (!verdict.ok) return verdict;
  try {
    // 'wx' fails when the same request is already waiting, so a double click queues once.
    await fs.writeFile(path.join(dir(), kind), new Date().toISOString(), { flag: 'wx' });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return { ok: false, status: 409, error: 'Already requested. Wait for it to run' };
    if (code === 'ENOENT') return { ok: false, status: 503, error: 'Updates are not set up on this server' };
    throw e;
  }
  return { ok: true };
}
