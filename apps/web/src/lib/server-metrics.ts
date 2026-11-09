// What the Server page shows, built from the files the host samples every minute
// (see `sample_metrics` in infra/prod/gust). No server-only imports, so it can be tested.

import type { ServerFacts } from './integrations';

export const RANGES = ['1h', '24h', '7d', '30d'] as const;
export type Range = (typeof RANGES)[number];

const RANGE_MS: Record<Range, number> = {
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
  '30d': 30 * 24 * 60 * 60_000,
};
const CHART_POINTS: Record<Range, number> = { '1h': 60, '24h': 96, '7d': 84, '30d': 90 };
const DAY_MS = 24 * 60 * 60_000;

export function rangeMs(range: Range): number {
  return RANGE_MS[range];
}

/** The host samples once a minute, so this many lines cover a range. */
export function linesFor(range: Range): number {
  return Math.ceil(RANGE_MS[range] / 60_000);
}

export function parseRange(raw: string | null): Range {
  return RANGES.find((r) => r === raw) ?? '24h';
}

export type Snapshot = {
  at: string;
  cpu: number;
  steal: number;
  load1: number;
  netInMBps: number;
  netOutMBps: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  uptimeSec: number | null;
};

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** One metrics line as the host wrote it; anything incomplete counts as no sample. */
export function parseSample(line: string): Snapshot | null {
  try {
    const v = JSON.parse(line) as Record<string, unknown>;
    const cpu = num(v.cpu);
    const steal = num(v.steal);
    const load1 = num(v.load1);
    const netInMBps = num(v.netInMBps);
    const netOutMBps = num(v.netOutMBps);
    const ramUsedGb = num(v.ramUsedGb);
    const ramTotalGb = num(v.ramTotalGb);
    const diskUsedGb = num(v.diskUsedGb);
    const diskTotalGb = num(v.diskTotalGb);
    if (
      cpu === null ||
      steal === null ||
      load1 === null ||
      netInMBps === null ||
      netOutMBps === null ||
      ramUsedGb === null ||
      ramTotalGb === null ||
      diskUsedGb === null ||
      diskTotalGb === null ||
      typeof v.at !== 'string' ||
      Number.isNaN(Date.parse(v.at))
    ) {
      return null;
    }
    return {
      at: v.at,
      cpu,
      steal,
      load1,
      netInMBps,
      netOutMBps,
      ramUsedGb,
      ramTotalGb,
      diskUsedGb,
      diskTotalGb,
      uptimeSec: num(v.uptimeSec),
    };
  } catch {
    return null;
  }
}

/** The latest sample (metrics.json), or null. */
export function parseLatest(raw: string | null): Snapshot | null {
  return raw ? parseSample(raw.trim()) : null;
}

/** Samples from a history file (metrics.jsonl) that are no older than `range`. Bad lines are skipped. */
export function parseHistory(raw: string, now: number, from: number): Snapshot[] {
  const out: Snapshot[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const s = parseSample(line);
    if (!s) continue;
    const t = Date.parse(s.at);
    if (t >= from && t <= now) out.push(s);
  }
  return out;
}

export type ChartSeries = { cpu: number[]; ram: number[]; disk: number[]; net: number[] };

/** Averages the samples into the points a chart shows: CPU %, RAM GB, disk %, network MB/s. */
export function chartSeries(samples: Snapshot[], range: Range): ChartSeries {
  const n = CHART_POINTS[range];
  const empty: ChartSeries = { cpu: [], ram: [], disk: [], net: [] };
  if (samples.length === 0) return empty;
  const buckets = Math.min(n, samples.length);
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor((b * samples.length) / buckets);
    const to = Math.floor(((b + 1) * samples.length) / buckets);
    const part = samples.slice(from, Math.max(to, from + 1));
    const avg = (f: (s: Snapshot) => number) => part.reduce((a, s) => a + f(s), 0) / part.length;
    empty.cpu.push(round(avg((s) => s.cpu)));
    empty.ram.push(round(avg((s) => s.ramUsedGb)));
    empty.disk.push(round(avg((s) => (s.diskTotalGb > 0 ? (s.diskUsedGb / s.diskTotalGb) * 100 : 0))));
    empty.net.push(round(avg((s) => s.netInMBps + s.netOutMBps)));
  }
  return empty;
}

function round(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Days until the disk is full, from a straight line through the last seven days of
 * disk use. Null when there is not enough history yet or the disk is not filling.
 */
export function diskForecastDays(samples: Snapshot[], now: number): number | null {
  const from = now - 7 * DAY_MS;
  const recent = samples.filter((s) => Date.parse(s.at) >= from && s.diskTotalGb > 0);
  if (recent.length < 2) return null;
  const t0 = Date.parse(recent[0]?.at ?? '');
  const xs = recent.map((s) => (Date.parse(s.at) - t0) / DAY_MS);
  const ys = recent.map((s) => s.diskUsedGb);
  if (xs[xs.length - 1] === undefined || (xs[xs.length - 1] ?? 0) < 2) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += ((xs[i] ?? 0) - mx) * ((ys[i] ?? 0) - my);
    den += ((xs[i] ?? 0) - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den; // GB per day
  if (slope <= 0.001) return null;
  const last = recent[recent.length - 1];
  if (!last) return null;
  const days = (last.diskTotalGb - last.diskUsedGb) / slope;
  return Number.isFinite(days) && days >= 0 ? Math.round(days) : null;
}

export type ContainerRow = { name: string; project: string | null; cpu: number; memoryMb: number; restarts: number };

/** What GET /api/server/metrics returns and the Server page shows. */
export type ServerView = {
  domain: string | null;
  facts: ServerFacts | null;
  snapshot: Snapshot | null;
  containers: ContainerRow[];
  range: Range;
  series: ChartSeries;
  diskForecastDays: number | null;
};

const UNIT_BYTES: Record<string, number> = {
  B: 1,
  kB: 1e3,
  KB: 1e3,
  KiB: 1024,
  MB: 1e6,
  MiB: 1024 ** 2,
  GB: 1e9,
  GiB: 1024 ** 3,
  TB: 1e12,
  TiB: 1024 ** 4,
};

/** "150MiB" → bytes, or null when the unit is unknown. */
export function parseBytes(raw: string): number | null {
  const m = /^([\d.]+)\s*([A-Za-z]+)$/.exec(raw.trim());
  if (!m) return null;
  const mult = UNIT_BYTES[m[2] ?? ''];
  const value = Number(m[1]);
  return mult === undefined || !Number.isFinite(value) ? null : value * mult;
}

/** "12.34%" → 12.34, or null. */
export function parsePercent(raw: string): number | null {
  const m = /^([\d.]+)%$/.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

/** "150MiB / 1.9GiB" → used MB (decimal), or null. */
export function parseMemUsage(raw: string): number | null {
  const used = raw.split('/')[0];
  const bytes = used === undefined ? null : parseBytes(used);
  return bytes === null ? null : Math.round(bytes / 1e5) / 10;
}

const NO_VALUE = '<no value>';
const label = (s: string | undefined): string | null => (s && s !== NO_VALUE ? s : null);

/**
 * Joins `docker stats` (one JSON object a line, running containers) with
 * `docker inspect` lines `name|restarts|gust project|compose project` (all containers).
 */
export function buildContainers(statsRaw: string, inspectRaw: string): ContainerRow[] {
  const stats = new Map<string, { cpu: number; memoryMb: number }>();
  for (const line of statsRaw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line) as { Name?: unknown; CPUPerc?: unknown; MemUsage?: unknown };
      if (typeof v.Name !== 'string' || typeof v.CPUPerc !== 'string' || typeof v.MemUsage !== 'string') continue;
      stats.set(v.Name, { cpu: parsePercent(v.CPUPerc) ?? 0, memoryMb: parseMemUsage(v.MemUsage) ?? 0 });
    } catch {
      // A broken line is skipped; the next minute brings a new one.
    }
  }
  const rows: ContainerRow[] = [];
  for (const line of inspectRaw.split('\n')) {
    const [rawName, restarts, gustProject, composeProject] = line.split('|');
    if (!rawName) continue;
    const name = rawName.replace(/^\//, '');
    const s = stats.get(name);
    rows.push({
      name,
      project: label(gustProject) ?? label(composeProject),
      cpu: s?.cpu ?? 0,
      memoryMb: s?.memoryMb ?? 0,
      restarts: Number.parseInt(restarts ?? '0', 10) || 0,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
