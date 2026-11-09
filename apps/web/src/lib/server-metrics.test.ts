import { describe, expect, it } from 'vitest';

import {
  buildContainers,
  chartSeries,
  diskForecastDays,
  linesFor,
  parseBytes,
  parseHistory,
  parseLatest,
  parseMemUsage,
  parsePercent,
  parseRange,
  parseSample,
  type Snapshot,
} from './server-metrics';

const DAY = 24 * 60 * 60_000;
const NOW = Date.parse('2026-11-09T12:00:00Z');

function sample(atMs: number, diskUsedGb: number, extra: Partial<Snapshot> = {}): Snapshot {
  return {
    at: new Date(atMs).toISOString(),
    cpu: 10,
    steal: 0,
    load1: 0.5,
    netInMBps: 1,
    netOutMBps: 2,
    ramUsedGb: 1,
    ramTotalGb: 2,
    diskUsedGb,
    diskTotalGb: 20,
    uptimeSec: 3600,
    ...extra,
  };
}

const line = (s: Snapshot) => JSON.stringify(s);

describe('metrics samples', () => {
  it('reads a complete sample and rejects one with a missing field', () => {
    const s = sample(NOW, 6);
    expect(parseSample(line(s))).toEqual(s);
    expect(parseSample(JSON.stringify({ ...s, cpu: undefined }))).toBeNull();
    expect(parseSample('{"cpu":')).toBeNull();
    expect(parseLatest(null)).toBeNull();
  });

  it('keeps only samples inside the range and skips broken lines', () => {
    const raw = [line(sample(NOW - 2 * 3600_000, 5)), '{broken', line(sample(NOW - 60_000, 6)), ''].join('\n');
    const inHour = parseHistory(raw, NOW, NOW - 3600_000);
    expect(inHour).toHaveLength(1);
    expect(inHour[0]?.diskUsedGb).toBe(6);
  });

  it('maps the range names and lines per range', () => {
    expect(parseRange('7d')).toBe('7d');
    expect(parseRange('nope')).toBe('24h');
    expect(linesFor('1h')).toBe(60);
    expect(linesFor('24h')).toBe(1440);
  });

  it('averages samples into chart points', () => {
    const samples = [sample(NOW - 2 * 60_000, 6, { cpu: 10 }), sample(NOW - 60_000, 6, { cpu: 30 })];
    const s = chartSeries(samples, '1h');
    expect(s.cpu).toEqual([10, 30]);
    expect(s.disk).toEqual([30, 30]);
    expect(s.net).toEqual([3, 3]);
    expect(chartSeries([], '1h')).toEqual({ cpu: [], ram: [], disk: [], net: [] });
  });
});

describe('disk forecast', () => {
  it('projects the days until the disk is full from a rising trend', () => {
    // 1 GB a day over three days, 10 GB used of 20 GB now: ten days left.
    const samples = [0, 1, 2, 3].map((d) => sample(NOW - (3 - d) * DAY, 7 + d));
    expect(diskForecastDays(samples, NOW)).toBe(10);
  });

  it('gives no forecast for a flat disk, a short history or too few samples', () => {
    const flat = [0, 1, 2, 3].map((d) => sample(NOW - (3 - d) * DAY, 6));
    expect(diskForecastDays(flat, NOW)).toBeNull();
    expect(diskForecastDays([sample(NOW, 6)], NOW)).toBeNull();
    const short = [sample(NOW - 3600_000, 6), sample(NOW, 7)];
    expect(diskForecastDays(short, NOW)).toBeNull();
  });
});

describe('container rows', () => {
  it('reads docker units and percentages', () => {
    expect(parsePercent('12.34%')).toBe(12.34);
    expect(parsePercent('n/a')).toBeNull();
    expect(parseBytes('150MiB')).toBe(150 * 1024 * 1024);
    expect(parseBytes('1.5GB')).toBe(1.5e9);
    expect(parseBytes('weird')).toBeNull();
    expect(parseMemUsage('150MiB / 1.9GiB')).toBe(157.3);
  });

  it('joins stats and inspect, marks projects and keeps stopped containers', () => {
    const stats = [
      JSON.stringify({ Name: 'gust-web-1', CPUPerc: '0.50%', MemUsage: '120MiB / 2GiB' }),
      JSON.stringify({ Name: 'traefik', CPUPerc: '1.25%', MemUsage: '40MiB / 2GiB' }),
    ].join('\n');
    const inspect = ['/traefik|0|<no value>|gust', '/gust-web-1|2|gust-web|', '/old-job|5|<no value>|<no value>'].join('\n');
    const rows = buildContainers(stats, inspect);
    expect(rows.map((r) => r.name)).toEqual(['gust-web-1', 'old-job', 'traefik']);
    expect(rows[0]).toMatchObject({ project: 'gust-web', cpu: 0.5, restarts: 2 });
    expect(rows[1]).toMatchObject({ project: null, cpu: 0, restarts: 5 });
    expect(rows[2]).toMatchObject({ project: 'gust', cpu: 1.25, restarts: 0 });
  });
});
