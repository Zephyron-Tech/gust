'use client';

import type { EnvScope } from '@gust/contracts';
import { ArrowsClockwise, Eye, EyeSlash, LockSimple, PencilSimple, Plus, Trash } from '@phosphor-icons/react/ssr';
import { use, useCallback, useEffect, useState } from 'react';

import { EnvBadge } from '@/components/EnvBadge';
import { Select } from '@/components/Select';
import { btn, cx, Table, Td } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';

type Row = { id: string; key: string; scope: EnvScope; isSecret: boolean; value: string | null };
type Stale = { branch: string | null; liveTag: string; changedAt: string };
type EnvResponse = { rows: Row[]; stale: Stale[] };

const SCOPES: { value: EnvScope; label: string }[] = [
  { value: 'all', label: 'Production + Preview' },
  { value: 'production', label: 'Production' },
  { value: 'preview', label: 'Preview' },
];
const scopeLabel = (s: EnvScope) => SCOPES.find((x) => x.value === s)?.label ?? s;
const scopeOrder: Record<EnvScope, number> = { all: 0, production: 1, preview: 2 };

const field =
  'h-9 w-full rounded-[10px] border border-line bg-bg px-3 font-mono text-[13px] outline-none transition-colors focus:border-accent';
const linkBtn = 'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[14px] font-medium transition-colors duration-150';

function ScopeSelect({ value, onChange, label }: { value: EnvScope; onChange: (s: EnvScope) => void; label: string }) {
  return <Select label={label} value={value} onValueChange={(v) => onChange(v as EnvScope)} options={SCOPES} className="h-9 w-auto" />;
}

export default function EnvironmentPage({ params }: { params: Promise<{ slug: string; service: string }> }) {
  const { slug, service } = use(params);
  const base = `/api/projects/${slug}/${service}/env`;
  const { notify, deploy, busy } = useDemo();
  const { data: session } = authClient.useSession();
  const admin = (session?.user as { role?: string } | undefined)?.role === 'admin';

  const [data, setData] = useState<EnvResponse | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string; isSecret: boolean; scope: EnvScope } | null>(null);
  const [draft, setDraft] = useState<{ key: string; value: string; isSecret: boolean; scope: EnvScope }>({
    key: '',
    value: '',
    isSecret: false,
    scope: 'all',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(base).catch(() => null);
    setData(res?.ok ? await res.json() : { rows: [], stale: [] });
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const hide = (id: string) =>
    setShown((s) => {
      const { [id]: _, ...rest } = s;
      return rest;
    });

  async function send(url: string, method: 'POST' | 'PUT', body: object) {
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    if (!res) {
      notify('Not saved', 'Could not reach Gust. Nothing was changed. Try again.', 'err');
      return false;
    }
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      notify('Not saved', error ?? 'Check the key and try again.', 'err');
      return false;
    }
    return true;
  }

  async function reveal(r: Row) {
    if (shown[r.id] !== undefined) return hide(r.id);
    const res = await fetch(`${base}/${r.id}/reveal`, { method: 'POST' }).catch(() => null);
    if (!res?.ok)
      return notify(
        'Could not reveal',
        res?.status === 403 ? 'Only admins can reveal secrets.' : 'Could not reach Gust. Try again.',
        'err',
      );
    const { value } = (await res.json()) as { value: string };
    setShown((s) => ({ ...s, [r.id]: value }));
    // Hide it again on its own after half a minute.
    window.setTimeout(() => hide(r.id), 30_000);
  }

  async function remove(r: Row) {
    if (confirm !== r.id) {
      setConfirm(r.id);
      window.setTimeout(() => setConfirm((c) => (c === r.id ? null : c)), 4000);
      return;
    }
    const res = await fetch(`${base}/${r.id}`, { method: 'DELETE' }).catch(() => null);
    setConfirm(null);
    if (!res?.ok)
      return notify(
        'Could not delete',
        res?.status === 403 ? 'Only admins can delete variables.' : 'Could not reach Gust. Nothing was changed. Try again.',
        'err',
      );
    notify(`${r.key} deleted`);
    void load();
  }

  async function saveEdit(r: Row) {
    if (!editing) return;
    setSaving(true);
    const ok = await send(`${base}/${r.id}`, 'PUT', { value: editing.value, isSecret: editing.isSecret, scope: editing.scope });
    setSaving(false);
    if (!ok) return;
    hide(r.id);
    setEditing(null);
    notify(`${r.key} updated`);
    void load();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const key = draft.key.trim().toUpperCase();
    setSaving(true);
    const ok = await send(base, 'POST', { ...draft, key });
    setSaving(false);
    if (!ok) return;
    notify(`${key} saved`, draft.isSecret ? 'Encrypted at rest.' : undefined);
    setDraft({ key: '', value: '', isSecret: false, scope: draft.scope });
    void load();
  }

  const list = [...(data?.rows ?? [])].sort((a, b) => a.key.localeCompare(b.key) || scopeOrder[a.scope] - scopeOrder[b.scope]);
  const stale = data?.stale ?? [];

  return (
    <div className="view-in space-y-4">
      {stale.length > 0 && (
        <div className="fade-in space-y-3 rounded-2xl border border-accent/40 bg-accent-soft px-5 py-4">
          <p className="flex items-center gap-3 text-[14.5px]">
            <ArrowsClockwise size={20} className="shrink-0 text-accent" />
            <span>
              <span className="font-medium">Environment changed.</span>{' '}
              <span className="text-fg-2">These deployments still run with the previous values. Redeploy only what changed.</span>
            </span>
          </p>
          <ul className="space-y-2">
            {stale.map((s) => (
              <li key={s.branch ?? 'production'} className="flex flex-wrap items-center gap-3 rounded-xl bg-bg/50 px-3.5 py-2.5">
                <EnvBadge env={s.branch ? { kind: 'preview', branch: s.branch } : { kind: 'production' }} />
                <span className="flex-1 text-[14px] text-fg-2">
                  running <span className="font-mono text-[13px] text-fg">{s.liveTag}</span>
                </span>
                <button
                  type="button"
                  className={btn.primary}
                  disabled={busy(slug, service, s.branch)}
                  onClick={() => deploy(slug, service, undefined, s.liveTag, s.branch)}
                >
                  <ArrowsClockwise /> {s.branch ? `Redeploy preview · ${s.branch}` : 'Redeploy production'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stale.length === 0 && <p className="text-[14px] text-fg-3">Changes apply on the next deploy of each environment.</p>}

      <Table head={['Key', 'Value', 'Environment', '']}>
        {list.map((r) => {
          const value = r.isSecret ? shown[r.id] : (r.value ?? undefined);
          const isEditing = editing?.id === r.id;
          return (
            <tr key={r.id}>
              <Td className="w-px whitespace-nowrap">
                <span className="flex items-center gap-2 font-mono text-[13px]">
                  {r.isSecret && <LockSimple size={14} className="shrink-0 text-fg-3" aria-label="secret" />}
                  {r.key}
                </span>
              </Td>
              {isEditing ? (
                <Td colSpan={3}>
                  <form
                    className="fade-in flex flex-wrap items-center gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveEdit(r);
                    }}
                  >
                    <input
                      // biome-ignore lint/a11y/noAutofocus: the field the user just asked to edit
                      autoFocus
                      required={!r.isSecret}
                      value={editing.value}
                      onChange={(e) => setEditing((x) => x && { ...x, value: e.target.value })}
                      type={editing.isSecret ? 'password' : 'text'}
                      placeholder={r.isSecret ? 'Leave empty to keep the current value' : undefined}
                      autoComplete="new-password"
                      spellCheck={false}
                      aria-label={`New value for ${r.key}`}
                      onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                      className={cx(field, 'min-w-[220px] flex-1')}
                    />
                    <ScopeSelect
                      label={`Environment for ${r.key}`}
                      value={editing.scope}
                      onChange={(scope) => setEditing((x) => x && { ...x, scope })}
                    />
                    <label className="flex shrink-0 items-center gap-2 text-[14px] text-fg-2">
                      <input
                        type="checkbox"
                        checked={editing.isSecret}
                        onChange={(e) => setEditing((x) => x && { ...x, isSecret: e.target.checked })}
                        className="size-4 accent-[var(--g-accent)]"
                      />
                      Secret
                    </label>
                    <button type="button" className={btn.ghost} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                    <button type="submit" disabled={saving} className={btn.primary}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </form>
                </Td>
              ) : (
                <>
                  <Td
                    className={cx('w-full font-mono text-[13px] break-all text-fg-2', value === undefined && 'tracking-[0.15em] text-fg-3')}
                  >
                    <span key={String(value !== undefined)} className="fade-in">
                      {value ?? '••••••••••••'}
                    </span>
                  </Td>
                  <Td className="w-px text-[14px] whitespace-nowrap text-fg-2">{scopeLabel(r.scope)}</Td>
                  <Td className="w-px text-right whitespace-nowrap">
                    {admin && r.isSecret && (
                      <button type="button" onClick={() => reveal(r)} className={cx(linkBtn, 'text-accent hover:bg-accent-soft')}>
                        {shown[r.id] !== undefined ? <EyeSlash size={17} /> : <Eye size={17} />}
                        {shown[r.id] !== undefined ? 'Hide' : 'Reveal'}
                      </button>
                    )}
                    {admin && (
                      <button
                        type="button"
                        aria-label={`Edit ${r.key}`}
                        // Secrets start empty: editing never shows the old value.
                        onClick={() =>
                          setEditing({ id: r.id, value: r.isSecret ? '' : (r.value ?? ''), isSecret: r.isSecret, scope: r.scope })
                        }
                        className={cx(linkBtn, 'ml-1 text-fg-2 hover:bg-bg-3 hover:text-fg')}
                      >
                        <PencilSimple size={16} /> Edit
                      </button>
                    )}
                    {admin && (
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        aria-label={confirm === r.id ? `Confirm deleting ${r.key}` : `Delete ${r.key}`}
                        className={cx(linkBtn, 'ml-1', confirm === r.id ? 'bg-err text-white' : 'text-fg-3 hover:bg-err/10 hover:text-err')}
                      >
                        <Trash size={16} />
                        {confirm === r.id && 'Delete?'}
                      </button>
                    )}
                  </Td>
                </>
              )}
            </tr>
          );
        })}
      </Table>
      {data !== null && list.length === 0 && <p className="text-[14px] text-fg-3">No variables yet.</p>}

      {admin ? (
        <form
          onSubmit={add}
          className="grid grid-cols-2 items-end gap-3 rounded-2xl border border-line bg-bg-2 p-4 xl:grid-cols-[200px_1fr_auto_auto_auto]"
        >
          <label className="space-y-1">
            <span className="text-[13px] text-fg-3">Key</span>
            <input
              required
              value={draft.key}
              onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
              placeholder="DATABASE_URL"
              autoComplete="off"
              spellCheck={false}
              className={field}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[13px] text-fg-3">Value</span>
            <input
              required
              value={draft.value}
              onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
              type={draft.isSecret ? 'password' : 'text'}
              autoComplete="new-password"
              spellCheck={false}
              className={field}
            />
          </label>
          <span className="space-y-1">
            <span className="block text-[13px] text-fg-3">Environment</span>
            <ScopeSelect label="Environment" value={draft.scope} onChange={(scope) => setDraft((d) => ({ ...d, scope }))} />
          </span>
          <label className="flex h-9 items-center gap-2 text-[14px] text-fg-2">
            <input
              type="checkbox"
              checked={draft.isSecret}
              onChange={(e) => setDraft((d) => ({ ...d, isSecret: e.target.checked }))}
              className="size-4 accent-[var(--g-accent)]"
            />
            Secret
          </label>
          <button type="submit" disabled={saving} className={btn.primary}>
            <Plus weight="bold" /> Add
          </button>
        </form>
      ) : (
        <p className="text-[14px] text-fg-3">Only admins can change variables and reveal secrets.</p>
      )}
      <p className="text-[13.5px] text-fg-3">
        A variable for Production + Preview is overridden by one with the same key set for a single environment. Secrets are encrypted at
        rest with the server's master key. Saving, deleting and revealing are written to the audit log; values never are.
      </p>
    </div>
  );
}
