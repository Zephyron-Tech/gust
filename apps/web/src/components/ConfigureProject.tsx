'use client';

import type { EnvScope } from '@gust/contracts';
import { CaretRight, Check, Plus, Trash, Warning } from '@phosphor-icons/react/ssr';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { parseDotenv } from '@/lib/dotenv';
import { slugFromRepo } from '@/lib/github-repo-logic';
import { btn, cx, Panel } from './ui';

export type ConfigureRepo = {
  fullName: string;
  name: string;
  url: string;
  defaultBranch: string;
  branches: string[];
  dockerfile: { found: boolean; port: number | null; healthPath: string | null };
};

type EnvRow = { key: string; value: string; scope: EnvScope; isSecret: boolean };
type Errors = Record<string, string>;

const field =
  'h-9 w-full rounded-[10px] border border-line bg-bg px-3 font-mono text-[13.5px] outline-none transition-colors focus:border-accent aria-[invalid=true]:border-err';
const select =
  'h-9 w-full rounded-[10px] border border-line bg-bg px-2.5 text-[14px] text-fg outline-none transition-colors focus:border-accent';
const label = 'mb-1.5 block text-[13.5px] text-fg-2';
const hint = 'mt-1 block text-[13px] text-fg-3';
const SCOPES: { value: EnvScope; label: string }[] = [
  { value: 'all', label: 'Production + Preview' },
  { value: 'production', label: 'Production' },
  { value: 'preview', label: 'Preview' },
];

/** Step 2 of a new project: the settings, filled in from the repository where it can. */
export function ConfigureProject({ repo, gustDomain }: { repo: ConfigureRepo; gustDomain: string | null }) {
  const router = useRouter();
  const [slug, setSlug] = useState(slugFromRepo(repo.name));
  const [branch, setBranch] = useState(repo.defaultBranch);
  const [previews, setPreviews] = useState<string[]>([]);
  const [service, setService] = useState('web');
  const [port, setPort] = useState(String(repo.dockerfile.port ?? 3000));
  const [healthPath, setHealthPath] = useState(repo.dockerfile.healthPath ?? '');
  // Only when Gust has no domain of its own to give production an automatic host.
  const [domain, setDomain] = useState('');
  const [memoryMb, setMemoryMb] = useState('512');
  const [cpu, setCpu] = useState('1');
  const [env, setEnv] = useState<EnvRow[]>([]);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);

  const host = gustDomain ? `${slug || 'project'}.${gustDomain}` : null;
  const togglePreview = (b: string) => setPreviews((p) => (p.includes(b) ? p.filter((x) => x !== b) : [...p, b]));

  function addPasted() {
    const parsed = parseDotenv(paste);
    if (!parsed.length) return;
    setEnv((rows) => {
      const next = [...rows];
      for (const p of parsed) {
        const i = next.findIndex((r) => r.key === p.key && r.scope === 'all');
        if (i >= 0) next[i] = { ...next[i], value: p.value } as EnvRow;
        else next.push({ ...p, scope: 'all', isSecret: false });
      }
      return next;
    });
    setPaste('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setGeneral(null);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug,
        repo: repo.fullName,
        branch,
        ...(gustDomain ? {} : { domain }),
        previewBranches: previews.filter((b) => b !== branch),
        service,
        port,
        healthPath,
        memoryMb,
        cpu,
        env: env.filter((r) => r.key.trim()).map((r) => ({ ...r, key: r.key.trim().toUpperCase() })),
      }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string; errors?: Errors; slug?: string; service?: string } | null;
    if (res?.status === 201 && body?.slug) {
      router.push(`/projects/${body.slug}/${body.service}/setup`);
      return;
    }
    setBusy(false);
    setErrors(body?.errors ?? {});
    setGeneral(res ? (body?.error ?? 'Could not create the project.') : 'Could not reach Gust. Nothing was saved. Try again.');
  }

  const err = (name: string) => (errors[name] ? <span className="mt-1 block text-[13px] text-err">{errors[name]}</span> : null);

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl space-y-5">
      <Panel className="space-y-6 p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Project name</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              required
              className={field}
              aria-invalid={!!errors.slug}
              spellCheck={false}
            />
            {err('slug') ?? (host && <span className={hint}>Production: https://{host}</span>)}
          </label>
          <label className="block">
            <span className={label}>Production branch</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={select}>
              {repo.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            {err('branch') ?? <span className={hint}>Pushes here deploy to production.</span>}
          </label>
        </div>

        {!gustDomain && (
          <label className="block max-w-sm">
            <span className={label}>Domain</span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value.toLowerCase())}
              placeholder="app.example.com"
              className={field}
              aria-invalid={!!errors.domain}
              spellCheck={false}
            />
            {err('domain') ?? <span className={hint}>GUST_DOMAIN is not set, so production needs a domain of its own.</span>}
          </label>
        )}

        {repo.branches.length > 1 && (
          <fieldset>
            <legend className={label}>Preview branches (optional)</legend>
            <div className="flex flex-wrap gap-2">
              {repo.branches
                .filter((b) => b !== branch)
                .map((b) => {
                  const on = previews.includes(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      aria-pressed={on}
                      onClick={() => togglePreview(b)}
                      className={cx(
                        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[13px] transition-colors duration-150',
                        on ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:border-fg-3 hover:text-fg',
                      )}
                    >
                      {on && <Check size={13} weight="bold" className="text-accent" />}
                      {b}
                    </button>
                  );
                })}
            </div>
            {err('previewBranches') ?? (
              <span className={hint}>
                Each gets its own host{gustDomain ? `, e.g. ${previews[0] ?? 'dev'}-${slug || 'project'}.${gustDomain}` : ''}.
              </span>
            )}
          </fieldset>
        )}

        <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Service</span>
            <input
              value={service}
              onChange={(e) => setService(e.target.value.toLowerCase())}
              className={field}
              aria-invalid={!!errors.service}
              spellCheck={false}
            />
            {err('service') ?? <span className={hint}>Image {`${slug || 'project'}/${service || 'web'}`} in Gust's registry.</span>}
          </label>
          <label className="block">
            <span className={label}>Port</span>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              inputMode="numeric"
              className={field}
              aria-invalid={!!errors.port}
            />
            {err('port') ??
              (repo.dockerfile.port ? (
                <span className={hint}>From EXPOSE in the Dockerfile.</span>
              ) : (
                <span className={hint}>The port the app listens on inside the container.</span>
              ))}
          </label>
        </div>

        {!repo.dockerfile.found && (
          <p className="flex items-start gap-2.5 rounded-xl bg-warn/10 px-4 py-3 text-[14px] text-fg-2">
            <Warning size={18} className="mt-px shrink-0 text-warn" />
            No Dockerfile at the root of {repo.defaultBranch}. The deploy action generates one for Next.js and Node.js apps. Other stacks
            need a Dockerfile before the first push.
          </p>
        )}

        <details className="group border-t border-line pt-5" open={!!(errors.healthPath || errors.memoryMb || errors.cpu)}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[14.5px] font-medium [&::-webkit-details-marker]:hidden">
            <CaretRight size={14} className="transition-transform duration-200 group-open:rotate-90" />
            Health check and resources
          </summary>
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            <label className="block">
              <span className={label}>Health path</span>
              <input
                value={healthPath}
                onChange={(e) => setHealthPath(e.target.value)}
                placeholder="/healthz"
                className={field}
                aria-invalid={!!errors.healthPath}
              />
              {err('healthPath') ?? <span className={hint}>Empty: Gust checks /.</span>}
            </label>
            <label className="block">
              <span className={label}>Memory (MB)</span>
              <input
                value={memoryMb}
                onChange={(e) => setMemoryMb(e.target.value)}
                inputMode="numeric"
                className={field}
                aria-invalid={!!errors.memoryMb}
              />
              {err('memoryMb')}
            </label>
            <label className="block">
              <span className={label}>CPU</span>
              <input
                value={cpu}
                onChange={(e) => setCpu(e.target.value)}
                inputMode="decimal"
                className={field}
                aria-invalid={!!errors.cpu}
              />
              {err('cpu')}
            </label>
          </div>
        </details>

        <details className="group border-t border-line pt-5" open={!!errors.env || env.length > 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[14.5px] font-medium [&::-webkit-details-marker]:hidden">
            <CaretRight size={14} className="transition-transform duration-200 group-open:rotate-90" />
            Environment variables
            {env.length > 0 && <span className="text-[13px] font-normal text-fg-3">{env.length}</span>}
          </summary>
          <div className="mt-4 space-y-3">
            {env.map((r, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto_auto_auto] items-center gap-2">
                <input
                  value={r.key}
                  onChange={(e) => setEnv((rows) => rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                  placeholder="KEY"
                  aria-label="Key"
                  className={field}
                  spellCheck={false}
                />
                <input
                  value={r.value}
                  onChange={(e) => setEnv((rows) => rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  type={r.isSecret ? 'password' : 'text'}
                  autoComplete="new-password"
                  aria-label={`Value of ${r.key || 'variable'}`}
                  className={field}
                  spellCheck={false}
                />
                <select
                  value={r.scope}
                  onChange={(e) => setEnv((rows) => rows.map((x, j) => (j === i ? { ...x, scope: e.target.value as EnvScope } : x)))}
                  aria-label={`Environment of ${r.key || 'variable'}`}
                  className={cx(select, 'w-auto')}
                >
                  {SCOPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-[13.5px] text-fg-2">
                  <input
                    type="checkbox"
                    checked={r.isSecret}
                    onChange={(e) => setEnv((rows) => rows.map((x, j) => (j === i ? { ...x, isSecret: e.target.checked } : x)))}
                    className="size-4 accent-[var(--g-accent)]"
                  />
                  Secret
                </label>
                <button
                  type="button"
                  aria-label={`Remove ${r.key || 'variable'}`}
                  onClick={() => setEnv((rows) => rows.filter((_, j) => j !== i))}
                  className="rounded-lg p-1.5 text-fg-3 transition-colors hover:bg-err/10 hover:text-err"
                >
                  <Trash size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEnv((rows) => [...rows, { key: '', value: '', scope: 'all', isSecret: false }])}
              className={btn.ghost}
            >
              <Plus weight="bold" /> Add variable
            </button>
            <div className="space-y-2">
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={'Or paste a .env file:\nDATABASE_URL=postgres://…\nAPI_KEY=…'}
                rows={3}
                spellCheck={false}
                aria-label="Paste a .env file"
                className="w-full rounded-[10px] border border-line bg-bg px-3 py-2 font-mono text-[13px] outline-none transition-colors focus:border-accent"
              />
              {paste.trim() && (
                <button type="button" onClick={addPasted} className={btn.secondary}>
                  Add {parseDotenv(paste).length} from paste
                </button>
              )}
            </div>
            {err('env') ?? <span className={hint}>You can change them later in the Environment tab. Mark secrets to encrypt them.</span>}
          </div>
        </details>
      </Panel>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className={btn.primary}>
          {busy ? 'Creating…' : 'Create project'}
        </button>
        {general && <p className="text-[14px] text-err">{general}</p>}
        {!general && <p className="text-[13.5px] text-fg-3">Next: add the deploy workflow to {repo.name}.</p>}
      </div>
    </form>
  );
}
