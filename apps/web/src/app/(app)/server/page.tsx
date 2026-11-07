'use client';

import { alerts, server } from '@gust/contracts/sample';
import { CheckCircle, HeartStraight, Warning } from '@phosphor-icons/react/ssr';
import { useMemo, useState } from 'react';

import { Chart } from '@/components/Chart';
import { btn, cx, PageHead, Panel, Table, Td } from '@/components/ui';
import { useDemo } from '@/lib/demo';
import { ago } from '@/lib/format';
import { series, useLive } from '@/lib/metrics';

type Range = '1h' | '24h' | '7d' | '30d';
const POINTS: Record<Range, number> = { '1h': 60, '24h': 96, '7d': 84, '30d': 90 };

export default function ServerPage() {
  const live = useLive();
  const { diskAlert, setDiskAlert, notify } = useDemo();
  const [range, setRange] = useState<Range>('24h');
  const n = POINTS[range];

  const charts = useMemo(() => {
    const disk = series(7, n, range === '30d' ? 22 : 30, 0.6, range === '30d' ? 0.1 : 0.01);
    if (diskAlert) disk.splice(-6, 6, 58, 66, 74, 82, 88, 91);
    return { cpu: series(3, n, 16, 14), ram: series(5, n, 5.1, 0.5), disk, net: series(11, n, 3, 4) };
  }, [n, range, diskAlert]);

  const disk = diskAlert ? 91 : 31;

  return (
    <div className="view-in space-y-5">
      <PageHead
        title={server.name}
        sub={`${server.plan} · ${server.vcpu} vCPU · ${server.ramGb} GB · ${server.os} · up ${server.uptimeDays} days`}
        actions={
          <fieldset className="flex gap-0.5 rounded-lg border border-line bg-bg-2 p-0.5" aria-label="Time range">
            {(Object.keys(POINTS) as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={cx(
                  'rounded-md px-3 py-1 text-[12.5px] transition-colors',
                  range === r ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:text-fg',
                )}
              >
                {r}
              </button>
            ))}
          </fieldset>
        }
      />

      {diskAlert ? (
        <div className="flex items-center gap-3 rounded-xl border border-err/35 bg-err/10 px-4 py-3 text-[13.5px]">
          <Warning size={18} weight="fill" className="shrink-0 text-err" />
          <p className="flex-1">
            <b className="font-medium">Disk 91 % full</b> · 91 of 100 GB. At the current rate it fills up in about 9 hours. Sent to iPhone
            and #ops on Discord.
          </p>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => {
              setDiskAlert(false);
              notify('Disk alert resolved', 'Pruned 61 GB of old images. Disk back to 30 %.');
            }}
          >
            Prune images
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-bg-2 px-4 py-3 text-[13.5px] text-fg-2">
          <CheckCircle size={18} weight="fill" className="shrink-0 text-ok" />
          <p className="flex-1">All 9 rules passing.</p>
          <span className="flex items-center gap-1.5 text-[12.5px] text-fg-3">
            <HeartStraight size={14} weight="fill" className="text-ok" /> Heartbeat to healthchecks.io 12 s ago
          </span>
          <button type="button" className={btn.ghost} onClick={() => setDiskAlert(true)}>
            Simulate full disk
          </button>
        </div>
      )}

      <Panel className="grid grid-cols-5 divide-x divide-line">
        {[
          ['CPU', `${live.cpu.toFixed(0)} %`, ''],
          ['RAM', `${live.ramGb.toFixed(1)} / ${server.ramGb} GB`, ''],
          ['Load (1 min)', live.load.toFixed(2), `${server.vcpu} vCPU`],
          ['Disk', `${disk} %`, diskAlert ? 'full in ~9 h' : 'full in ~210 days'],
          ['CPU steal', `${live.steal.toFixed(1)} %`, 'rule at 10 %'],
        ].map(([k, v, note]) => (
          <div key={k} className="space-y-1 px-5 py-4">
            <p className="text-[12.5px] text-fg-3">{k}</p>
            <p
              className={cx('font-display text-[21px] font-semibold tracking-tight tabular-nums', k === 'Disk' && diskAlert && 'text-err')}
            >
              {v}
            </p>
            {note && <p className="text-[12px] text-fg-3">{note}</p>}
          </div>
        ))}
      </Panel>

      <div className="grid grid-cols-2 gap-4">
        {[
          ['CPU', `${live.cpu.toFixed(0)} %`, charts.cpu, 100, '%', undefined],
          ['Memory', `${live.ramGb.toFixed(1)} GB used`, charts.ram, server.ramGb, 'GB', undefined],
          ['Disk', diskAlert ? 'forecast: full in ~9 h' : 'forecast: full in ~210 days', charts.disk, 100, '%', diskAlert ? 100 : 33],
          ['Network', `↓ ${live.netIn.toFixed(1)} · ↑ ${live.netOut.toFixed(1)} MB/s`, charts.net, 20, 'MB/s', undefined],
        ].map(([title, note, data, max, unit, fc]) => (
          <Panel key={title as string} className="space-y-2 px-4 pt-3.5 pb-2">
            <div className="flex items-baseline justify-between">
              <h2 className="font-sans text-[13.5px] font-medium tracking-normal">{title as string}</h2>
              <span className="text-[12.5px] text-fg-3">{note as string}</span>
            </div>
            <Chart data={data as number[]} max={max as number} unit={unit as string} forecast={fc as number | undefined} />
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <Table head={['Container · live', 'Project', 'CPU', 'Memory', 'Restarts']}>
          {live.containers.map((c) => (
            <tr key={c.name}>
              <Td className="font-mono text-[12.5px]">{c.name}</Td>
              <Td className="text-fg-3">{c.project}</Td>
              <Td className="font-mono text-[12.5px] tabular-nums">{c.cpu.toFixed(1)} %</Td>
              <Td className="font-mono text-[12.5px] tabular-nums">{Math.round(c.memoryMb)} MB</Td>
              <Td className="font-mono text-[12.5px]">{c.restarts}</Td>
            </tr>
          ))}
        </Table>
        <Panel className="self-start">
          <h2 className="border-b border-line px-4 py-2.5 font-sans text-[12px] font-medium tracking-normal text-fg-3">Alerts</h2>
          <ul>
            {diskAlert && (
              <li className="space-y-0.5 px-4 py-3">
                <p className="text-[13.5px] text-err">Disk above 90 %</p>
                <p className="text-[12.5px] text-fg-3">firing · just now · critical</p>
              </li>
            )}
            {alerts.map((a) => (
              <li key={a.id} className="space-y-0.5 border-t border-line px-4 py-3 first:border-t-0">
                <p className="text-[13.5px]">{a.rule}</p>
                <p className="text-[12.5px] text-fg-3">
                  resolved · {ago(a.startedAt)} · {a.detail}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
