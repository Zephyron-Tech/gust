'use client';

import { useState } from 'react';
import { Chart } from '@/components/Chart';
import { Segmented } from '@/components/Segmented';
import { Code, cx, PageHead, Panel, Table, Td } from '@/components/ui';
import { NOT_SET } from '@/lib/integrations';
import { RANGES, type Range, type ServerView } from '@/lib/server-metrics';
import { useServerMetrics } from '@/lib/useServerMetrics';

// Everything on this page is measured on the host and read from its sample files.
// `-` means the host has not reported it yet.
export default function ServerPage() {
  const [range, setRange] = useState<Range>('24h');
  const { data, error } = useServerMetrics(range);

  return (
    <div className="view-in space-y-6">
      <PageHead
        title={data?.domain ?? 'Server'}
        sub={subtitle(data)}
        actions={<Segmented options={[...RANGES]} value={range} onChange={setRange} label="Time range" />}
      />

      {error && <p className="rounded-xl border border-err/35 bg-err/10 px-5 py-3 text-[14px] text-err">{error}</p>}

      {data && !data.snapshot && (
        <p className="rounded-xl border border-line bg-bg-2 px-5 py-3 text-[14px] text-fg-2">
          No samples yet. The host records its state every minute (gust-metrics.timer).
        </p>
      )}

      <Summary data={data} />
      <Charts data={data} />
      <Containers data={data} />
    </div>
  );
}

function subtitle(data: ServerView | null): string {
  const f = data?.facts;
  const up = data?.snapshot?.uptimeSec;
  const parts = [
    f?.os,
    f ? `${f.vcpu} vCPU` : null,
    f ? `${f.ramGb} GB RAM` : null,
    f ? `${f.diskGb} GB disk` : null,
    up != null ? `up ${Math.floor(up / 86400)} days` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : NOT_SET;
}

function Summary({ data }: { data: ServerView | null }) {
  const s = data?.snapshot ?? null;
  const cells: [string, string, string][] = [
    ['CPU', s ? `${s.cpu.toFixed(0)} %` : NOT_SET, ''],
    ['RAM', s ? `${s.ramUsedGb.toFixed(1)} / ${s.ramTotalGb.toFixed(1)} GB` : NOT_SET, ''],
    ['Load (1 min)', s ? s.load1.toFixed(2) : NOT_SET, data?.facts ? `${data.facts.vcpu} vCPU` : ''],
    ['Disk', s ? `${diskPct(s).toFixed(0)} %` : NOT_SET, diskNote(data)],
    ['CPU steal', s ? `${s.steal.toFixed(1)} %` : NOT_SET, ''],
  ];
  return (
    <Panel className="grid grid-cols-5 divide-x divide-line">
      {cells.map(([k, v, note]) => (
        <div key={k} className="space-y-1 px-6 py-5">
          <p className="text-[13.5px] text-fg-3">{k}</p>
          <p className="font-display text-[26px] leading-tight font-semibold tracking-tight tabular-nums">{v}</p>
          {note && <p className="text-[13px] text-fg-3">{note}</p>}
        </div>
      ))}
    </Panel>
  );
}

function Charts({ data }: { data: ServerView | null }) {
  const s = data?.snapshot ?? null;
  const series = data?.series;
  const netNow = s ? `↓ ${s.netInMBps.toFixed(1)} · ↑ ${s.netOutMBps.toFixed(1)} MB/s` : NOT_SET;
  const panels: { title: string; note: string; data: number[]; max: number; unit: string }[] = [
    { title: 'CPU', note: s ? `${s.cpu.toFixed(0)} %` : NOT_SET, data: series?.cpu ?? [], max: 100, unit: '%' },
    {
      title: 'Memory',
      note: s ? `${s.ramUsedGb.toFixed(1)} GB used` : NOT_SET,
      data: series?.ram ?? [],
      max: s?.ramTotalGb ?? 1,
      unit: 'GB',
    },
    { title: 'Disk', note: diskNote(data) || NOT_SET, data: series?.disk ?? [], max: 100, unit: '%' },
    {
      title: 'Network',
      note: netNow,
      data: series?.net ?? [],
      max: niceMax(Math.max(0, ...(series?.net ?? []))),
      unit: 'MB/s',
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-4">
      {panels.map((p) => (
        <Panel key={p.title} className="space-y-3 px-5 pt-4 pb-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-sans text-[15px] font-medium tracking-normal">{p.title}</h2>
            <span className="text-[13.5px] text-fg-3 tabular-nums">{p.note}</span>
          </div>
          {p.data.length > 1 ? (
            <div key={`${p.title}-${data?.range}`} className="fade-in">
              <Chart data={p.data} max={p.max} unit={p.unit} />
            </div>
          ) : (
            <p className="py-10 text-center text-[14px] text-fg-3">Not enough samples for this range yet.</p>
          )}
        </Panel>
      ))}
    </div>
  );
}

function Containers({ data }: { data: ServerView | null }) {
  const rows = data?.containers ?? [];
  return (
    <Table head={['Container', 'Project', 'CPU', 'Memory', 'Restarts']}>
      {rows.map((c) => (
        <tr key={c.name}>
          <Td>
            <Code>{c.name}</Code>
          </Td>
          <Td className="text-fg-3">{c.project ?? NOT_SET}</Td>
          <Td className="tabular-nums">{c.cpu.toFixed(1)} %</Td>
          <Td className="tabular-nums">{Math.round(c.memoryMb)} MB</Td>
          <Td className={cx('tabular-nums', c.restarts > 0 && 'text-warn')}>{c.restarts}</Td>
        </tr>
      ))}
      {data && rows.length === 0 && (
        <tr>
          <Td colSpan={5} className="text-center text-fg-3">
            No containers reported yet.
          </Td>
        </tr>
      )}
    </Table>
  );
}

function diskPct(s: { diskUsedGb: number; diskTotalGb: number }): number {
  return s.diskTotalGb > 0 ? (s.diskUsedGb / s.diskTotalGb) * 100 : 0;
}

function diskNote(data: ServerView | null): string {
  if (!data?.snapshot) return '';
  const days = data.diskForecastDays;
  return days === null ? 'no growth forecast' : `full in ~${days} days`;
}

/** A round upper bound for the network chart, so the line never touches the top. */
function niceMax(v: number): number {
  if (v <= 1) return 1;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil((v * 1.2) / step) * step;
}
