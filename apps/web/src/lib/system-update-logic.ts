// Pure rules for the update requests from the Settings page. No I/O here, so
// the rules can be tested without the requests folder.

export type UpdateState = 'unknown' | 'idle' | 'running' | 'ok' | 'failed';

export type UpdateStatus = {
  state: UpdateState;
  action: string;
  current: string;
  latest: string;
  available: boolean;
  checkedAt: string | null;
  error: string | null;
  log?: string;
};

export type RequestKind = 'install' | 'check';

const STATES: UpdateState[] = ['idle', 'running', 'ok', 'failed'];

/** Reads status.json as the host wrote it; anything missing or odd becomes "unknown". */
export function parseStatus(raw: string | null): UpdateStatus {
  const unknown: UpdateStatus = {
    state: 'unknown',
    action: 'none',
    current: '',
    latest: '',
    available: false,
    checkedAt: null,
    error: null,
  };
  if (!raw) return unknown;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return unknown;
  }
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  const state = STATES.find((s) => s === v.state);
  return {
    state: state ?? 'unknown',
    action: str(v.action) || 'none',
    current: str(v.current),
    latest: str(v.latest),
    available: v.available === true,
    checkedAt: str(v.checkedAt) || null,
    error: str(v.error) || null,
  };
}

/** Keeps only the end of the log, so a long pull output cannot flood the page. */
export function tailLog(text: string, max = 6000): string {
  return text.length > max ? text.slice(text.length - max) : text;
}

export type Decision = { ok: true } | { ok: false; status: 409; error: string };

/** Whether a request may be queued given the status the host last wrote. */
export function decide(kind: RequestKind, s: Pick<UpdateStatus, 'state' | 'available'>): Decision {
  if (s.state === 'running') {
    return {
      ok: false,
      status: 409,
      error: kind === 'install' ? 'An update is already running' : 'An update is running. Check again when it finishes',
    };
  }
  if (kind === 'install' && !s.available) {
    return { ok: false, status: 409, error: 'No newer version to install' };
  }
  return { ok: true };
}
