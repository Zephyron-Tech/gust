'use client';

import type { ObservedStack } from '@gust/contracts';
import { ArrowsClockwise } from '@phosphor-icons/react/ssr';
import { useCallback, useEffect, useState } from 'react';
import { btn, Code, cx, PageHead, Panel, Table, Tag, Td } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';
import { size } from '@/lib/format';

/** Compose stacks on the host that Gust does not deploy. Gust lists them and restarts them, nothing else. */
export default function ObservedPage() {
  const { notify } = useDemo();
  const { data: session } = authClient.useSession();
  const admin = (session?.user as { role?: string } | undefined)?.role === 'admin';

  const [stacks, setStacks] = useState<ObservedStack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/observed', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setError('The engine did not answer. Try again in a moment.');
      return;
    }
    setError(null);
    setStacks((await res.json()) as ObservedStack[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function restart(name: string) {
    if (armed !== name) {
      setArmed(name);
      return;
    }
    setArmed(null);
    setBusy(name);
    const res = await fetch(`/api/observed/${encodeURIComponent(name)}/restart`, { method: 'POST' }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      return notify('Not restarted', body?.error ?? `${name} was not restarted. Try again.`, 'err');
    }
    notify('Restarted', `${name}: every container was restarted.`, 'ok');
    void load();
  }

  return (
    <div className="view-in space-y-7">
      <PageHead
        title="Observed stacks"
        sub="Docker Compose projects under /opt/docker. Gust shows them and can restart them, nothing else."
        actions={
          <button type="button" className={btn.secondary} onClick={() => void load()}>
            <ArrowsClockwise size={16} weight="bold" />
            Refresh
          </button>
        }
      />

      {error ? <p className="rounded-2xl border border-err/30 bg-err/10 px-5 py-3.5 text-[14px] text-err">{error}</p> : null}

      {stacks && stacks.length === 0 ? (
        <Panel className="px-5 py-6 text-[14.5px] text-fg-3">
          No Compose stacks under <Code className="text-fg-2">/opt/docker</Code> right now.
        </Panel>
      ) : null}

      {stacks && stacks.length > 0 ? (
        <Table head={['Stack', 'Domain', 'Containers', 'Memory', '']}>
          {stacks.map((s) => {
            const running = s.containers.filter((c) => c.state === 'running').length;
            const memory = s.containers.reduce((sum, c) => sum + (c.memoryMb ?? 0), 0);
            return (
              <tr key={s.name}>
                <Td>
                  <p className="font-medium text-fg">{s.name}</p>
                  <Code className="text-fg-3">{s.path}</Code>
                </Td>
                <Td className="text-fg-2">{s.domain ?? <span className="text-fg-3">no public domain</span>}</Td>
                <Td>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {s.containers.map((c) => (
                      <Tag key={c.name}>
                        <span
                          className={cx(
                            'mr-1.5 inline-block size-1.5 rounded-full align-middle',
                            c.state === 'running' ? 'bg-ok' : 'bg-fg-3',
                          )}
                        />
                        {c.name}
                        <span className="ml-1.5 text-fg-3">{c.state === 'running' ? c.status : c.state}</span>
                      </Tag>
                    ))}
                  </span>
                  <p className="mt-1.5 text-[12.5px] text-fg-3">
                    {running} of {s.containers.length} running
                  </p>
                </Td>
                <Td className="tabular-nums">{memory > 0 ? size(memory) : '—'}</Td>
                <Td className="text-right">
                  {admin ? (
                    <button type="button" className={btn.secondary} disabled={busy === s.name} onClick={() => void restart(s.name)}>
                      {busy === s.name ? 'Restarting…' : armed === s.name ? 'Really restart?' : 'Restart'}
                    </button>
                  ) : null}
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : null}
    </div>
  );
}
