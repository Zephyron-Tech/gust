'use client';

import { ArrowSquareOut, Plus, Trash } from '@phosphor-icons/react/ssr';
import { use, useCallback, useEffect, useState } from 'react';

import { Ago } from '@/components/Ago';
import { EnvBadge } from '@/components/EnvBadge';
import { PreviewRow, type PreviewRowData } from '@/components/PreviewRow';
import { btn, cx, Panel } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';

type DomainState = 'pending_dns' | 'applying' | 'live' | 'error';
type ProductionDomain = { host: string; state: DomainState; error: string | null; checkedAt: string | null };
type PreviewDomain = PreviewRowData;
type DomainsView = { serverIp: string | null; cnameTarget: string | null; production: ProductionDomain[]; previews: PreviewDomain[] };

const stateTag: Record<DomainState, [string, string]> = {
  pending_dns: ['Waiting for DNS', 'bg-warn/14 text-warn pulse-dot'],
  applying: ['DNS OK, going live', 'bg-info/14 text-info pulse-dot'],
  live: ['Live', 'bg-ok/14 text-ok'],
  error: ['Error', 'bg-err/14 text-err'],
};

function StateTag({ state }: { state: DomainState }) {
  const [label, tone] = stateTag[state];
  return (
    <span
      className={cx(
        'inline-flex w-max items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] leading-none font-medium before:size-1.5 before:rounded-full before:bg-current',
        tone,
      )}
    >
      {label}
    </span>
  );
}

/** The records to add at the DNS provider: an A record for an apex, a CNAME (or A) for a subdomain. */
function dnsRecords(host: string, ip: string | null, cname: string | null) {
  const labels = host.split('.');
  const apex = labels.length <= 2;
  const name = apex ? '@' : labels.slice(0, -2).join('.');
  const rows: { type: string; name: string; value: string; note?: string }[] = [];
  if (!apex && cname) rows.push({ type: 'CNAME', name, value: cname, note: 'recommended' });
  rows.push({ type: 'A', name, value: ip ?? 'set GUST_SERVER_IP', note: apex || !cname ? undefined : 'or instead' });
  return rows;
}

const cell = 'px-4 py-2.5 text-left';

export default function DomainsPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = use(params);
  const base = `/api/projects/${slug}/${service}/domains`;
  const { notify } = useDemo();
  const { data: session } = authClient.useSession();
  const admin = (session?.user as { role?: string } | undefined)?.role === 'admin';
  const [data, setData] = useState<DomainsView | null>(null);
  const [host, setHost] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(base).catch(() => null);
    setData(res?.ok ? await res.json() : { serverIp: null, cnameTarget: null, production: [], previews: [] });
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  // While a domain is on its way, follow it; the worker checks every half minute.
  const waiting = data?.production.some((d) => d.state === 'pending_dns' || d.state === 'applying') ?? false;
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => !document.hidden && void load(), 10_000);
    return () => clearInterval(id);
  }, [waiting, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ host }),
    }).catch(() => null);
    setSaving(false);
    if (!res) return notify('Domain not added', 'Could not reach Gust. Nothing was changed. Try again.', 'err');
    const body = (await res.json().catch(() => ({}))) as { host?: string; error?: string };
    if (!res.ok) return notify('Domain not added', body.error ?? 'Try again.', 'err');
    notify(`${body.host} added`, 'Add the DNS record below. Gust takes it live as soon as it resolves here.');
    setHost('');
    void load();
  }

  async function remove(h: string) {
    if (confirm !== h) {
      setConfirm(h);
      window.setTimeout(() => setConfirm((c) => (c === h ? null : c)), 4000);
      return;
    }
    setConfirm(null);
    const res = await fetch(`${base}/${encodeURIComponent(h)}`, { method: 'DELETE' }).catch(() => null);
    if (!res) return notify('Could not remove', 'Could not reach Gust. Nothing was changed. Try again.', 'err');
    const body = (await res.json().catch(() => ({}))) as { deploymentId?: string | null; error?: string };
    if (!res.ok) return notify('Could not remove', body.error ?? 'Try again in a moment.', 'err');
    notify(`${h} removed`, body.deploymentId ? 'A production redeploy takes it off the router.' : undefined);
    void load();
  }

  return (
    <div className="view-in space-y-8">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="flex items-center gap-3 text-[17px] font-medium">
            <EnvBadge env={{ kind: 'production' }} /> Domains
          </h2>
          <p className="text-[13.5px] text-fg-3">Certificates from Let’s Encrypt, renewed by Traefik.</p>
        </div>

        <Panel className="overflow-hidden">
          {data?.production.map((d, i) => (
            <div key={d.host} className={cx('px-5 py-4', i > 0 && 'border-t border-line')}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4">
                <span className="min-w-0">
                  {d.state === 'live' ? (
                    <a
                      href={`https://${d.host}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1.5 truncate text-[15px] font-medium hover:text-accent"
                    >
                      {d.host} <ArrowSquareOut size={14} className="shrink-0 text-fg-3" />
                    </a>
                  ) : (
                    <span className="block truncate text-[15px] font-medium">{d.host}</span>
                  )}
                  {(d.error || d.checkedAt) && (
                    <span className="block truncate text-[13px] text-fg-3">
                      {d.error ?? (d.state === 'live' ? 'Serving over HTTPS' : '')}
                      {d.checkedAt && (
                        <>
                          {' · checked '}
                          <Ago iso={d.checkedAt} />
                        </>
                      )}
                    </span>
                  )}
                </span>
                <StateTag state={d.state} />
                {admin ? (
                  <button
                    type="button"
                    onClick={() => remove(d.host)}
                    aria-label={confirm === d.host ? `Confirm removing ${d.host}` : `Remove ${d.host}`}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[14px] font-medium transition-colors duration-150',
                      confirm === d.host ? 'bg-err text-white' : 'text-fg-3 hover:bg-err/10 hover:text-err',
                    )}
                  >
                    <Trash size={16} />
                    {confirm === d.host && 'Remove?'}
                  </button>
                ) : (
                  <span />
                )}
              </div>

              {d.state === 'pending_dns' && (
                <div className="fade-in mt-4 space-y-2.5 rounded-xl border border-line bg-bg px-4 py-3.5">
                  <p className="text-[14px] text-fg-2">Add this record at your DNS provider. Gust checks it every half minute.</p>
                  <table className="w-full text-[13.5px]">
                    <thead className="text-fg-3">
                      <tr>
                        <th className={cx(cell, 'w-24 pl-0 font-medium')}>Type</th>
                        <th className={cx(cell, 'font-medium')}>Name</th>
                        <th className={cx(cell, 'font-medium')}>Value</th>
                        <th className={cx(cell, 'pr-0')} />
                      </tr>
                    </thead>
                    <tbody>
                      {dnsRecords(d.host, data.serverIp, data.cnameTarget).map((r) => (
                        <tr key={r.type} className="border-t border-line">
                          <td className={cx(cell, 'pl-0 font-mono text-[13px]')}>{r.type}</td>
                          <td className={cx(cell, 'font-mono text-[13px]')}>{r.name}</td>
                          <td className={cx(cell, 'font-mono text-[13px] break-all')}>{r.value}</td>
                          <td className={cx(cell, 'pr-0 text-right text-fg-3')}>{r.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {data && data.production.length === 0 && <p className="px-5 py-8 text-center text-fg-3">No production domain yet.</p>}
          {!data && <p className="px-5 py-8 text-center text-fg-3">Loading…</p>}
        </Panel>

        {admin && (
          <form onSubmit={add} className="flex items-end gap-3 rounded-2xl border border-line bg-bg-2 p-4">
            <label className="flex-1 space-y-1">
              <span className="text-[13px] text-fg-3">Add a domain</span>
              <input
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="app.example.com"
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
                className="h-9 w-full rounded-[10px] border border-line bg-bg px-3 font-mono text-[13px] outline-none transition-colors focus:border-accent"
              />
            </label>
            <button type="submit" disabled={saving} className={btn.primary}>
              <Plus weight="bold" /> {saving ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}
        {data && !data.serverIp && (
          <p className="rounded-2xl bg-info/10 px-5 py-3.5 text-[14px] text-fg-2">
            Server IP not set. Add <span className="font-mono text-[13px] text-fg">GUST_SERVER_IP</span> to /opt/gust/.env and run gust
            update, so Gust can show the A record and verify new domains.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[17px] font-medium">Previews</h2>
          <p className="text-[13.5px] text-fg-3">
            Each preview branch and open pull request gets its own host automatically. Branches are set in Settings.
          </p>
        </div>
        <Panel className="overflow-hidden">
          {data?.previews.map((p, i) => (
            <PreviewRow key={p.branch} p={p} first={i === 0} />
          ))}
          {data && data.previews.length === 0 && (
            <p className="px-5 py-8 text-center text-fg-3">No preview branches. Add one in Settings → Branches.</p>
          )}
        </Panel>
      </section>
    </div>
  );
}
