'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { btn, cx, Panel } from '@/components/ui';

const field =
  'h-9 w-full rounded-[10px] border border-line bg-bg px-3 font-mono text-[13.5px] outline-none transition-colors focus:border-accent';
const label = 'mb-1.5 block text-[13.5px] text-fg-2';

type Errors = Record<string, string>;

// The same rules as `gust project add`, checked on the server too.
export function NewProjectForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    setBusy(true);
    setErrors({});
    setGeneral(null);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setGeneral('Could not reach Gust. Nothing was saved. Try again.');
    const body = (await res.json().catch(() => null)) as { error?: string; errors?: Errors; slug?: string; service?: string } | null;
    if (res.status === 201 && body?.slug) {
      router.push(`/projects/${body.slug}/${body.service}/deployments`);
      return;
    }
    setErrors(body?.errors ?? {});
    setGeneral(body?.error ?? 'Could not create the project.');
  }

  const err = (name: string) => (errors[name] ? <span className="mt-1 block text-[13px] text-err">{errors[name]}</span> : null);

  return (
    <Panel className="min-w-0 max-w-2xl p-6">
      <form onSubmit={submit} className="grid gap-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Project slug</span>
            <input name="slug" required placeholder="smart-targets" className={field} aria-invalid={!!errors.slug} />
            {err('slug')}
          </label>
          <label className="block">
            <span className={label}>GitHub repository</span>
            <input name="repo" required placeholder="Zephyron-Tech/smart-targets-core" className={field} aria-invalid={!!errors.repo} />
            {err('repo')}
          </label>
          <label className="block">
            <span className={label}>Production branch</span>
            <input name="branch" defaultValue="main" className={field} aria-invalid={!!errors.branch} />
            {err('branch')}
          </label>
          <label className="block">
            <span className={label}>Domain</span>
            <input name="domain" required placeholder="api.example.cz" className={field} aria-invalid={!!errors.domain} />
            {err('domain')}
          </label>
        </div>

        <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
          <label className="block">
            <span className={label}>First service</span>
            <input name="service" defaultValue="web" className={field} aria-invalid={!!errors.service} />
            {err('service')}
          </label>
          <label className="block">
            <span className={label}>Port</span>
            <input name="port" required inputMode="numeric" defaultValue="3000" className={field} aria-invalid={!!errors.port} />
            {err('port')}
          </label>
          <label className="block">
            <span className={label}>Health path (optional)</span>
            <input name="healthPath" placeholder="/healthz" className={field} aria-invalid={!!errors.healthPath} />
            {err('healthPath')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>Memory (MB)</span>
              <input name="memoryMb" inputMode="numeric" defaultValue="512" className={field} aria-invalid={!!errors.memoryMb} />
              {err('memoryMb')}
            </label>
            <label className="block">
              <span className={label}>CPU</span>
              <input name="cpu" inputMode="decimal" defaultValue="1" className={field} aria-invalid={!!errors.cpu} />
              {err('cpu')}
            </label>
          </div>
        </div>

        {general && (
          <p role="status" className="rounded-xl border border-err/30 bg-err/10 p-3 text-[14px] text-err">
            {general}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={cx(btn.primary, 'w-48')}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
          <span className="text-[13.5px] text-fg-3">Add the repository to the Gust GitHub App afterwards.</span>
        </div>
      </form>
    </Panel>
  );
}
