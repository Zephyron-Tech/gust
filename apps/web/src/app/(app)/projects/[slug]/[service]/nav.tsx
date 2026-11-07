'use client';

import { Dialog } from '@base-ui/react/dialog';
import { Check, Rocket } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { btn, cx } from '@/components/ui';
import { useDemo } from '@/lib/demo';
import { useIndicator } from '@/lib/useIndicator';

const TABS = ['deployments', 'domains', 'environment', 'logs', 'settings'] as const;

export function ServiceTabs({ base, stateful }: { base: string; stateful: boolean }) {
  const path = usePathname();
  const tabs = stateful ? (['environment', 'logs', 'settings'] as const) : TABS;
  const [pending, setPending] = useState<{ tab: string; from: string } | null>(null);
  const current = tabs.find((t) => path === `${base}/${t}` || path.startsWith(`${base}/${t}/`)) ?? null;
  const active = pending && pending.from === path ? pending.tab : current;
  const { ref, style } = useIndicator<HTMLElement>(active);
  return (
    <nav ref={ref} aria-label="Service" className="relative flex gap-1 border-b border-line">
      <span aria-hidden className="absolute top-0 left-0 rounded-full bg-accent" style={style('underline')} />
      {tabs.map((t) => {
        const href = `${base}/${t}`;
        const on = active === t;
        return (
          <Link
            key={t}
            href={href}
            data-key={t}
            onClick={() => setPending({ tab: t, from: path })}
            aria-current={on ? 'page' : undefined}
            className={cx('px-3.5 py-3 text-[15px] capitalize transition-colors duration-200', on ? 'text-fg' : 'text-fg-2 hover:text-fg')}
          >
            {t}
          </Link>
        );
      })}
    </nav>
  );
}

export function ProjectActions({
  project,
  service,
  stateful,
  engine,
  image,
}: {
  project: string;
  service: string;
  stateful: boolean;
  engine?: boolean;
  image: string;
}) {
  const { deploy, busy, notify } = useDemo();
  if (engine && !stateful) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <Link href={`/projects/${project}/${service}/logs`} className={btn.secondary}>
          View logs
        </Link>
        <DeployDialog project={project} service={service} image={image} />
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link href={`/projects/${project}/${service}/logs`} className={btn.secondary}>
        View logs
      </Link>
      {stateful ? (
        <button
          type="button"
          className={btn.secondary}
          onClick={() => notify(`${project}/${service} restarted`, 'Backup taken first, volume kept.')}
        >
          Restart
        </button>
      ) : (
        <button type="button" className={btn.primary} disabled={busy(project, service)} onClick={() => deploy(project, service)}>
          <Rocket /> Redeploy
        </button>
      )}
    </div>
  );
}

// Picks an image tag from the registry and deploys it through the engine.
function DeployDialog({ project, service, image }: { project: string; service: string; image: string }) {
  const { deploy, busy, deployments } = useDemo();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[] | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const live = deployments.find((d) => d.project === project && d.service === service && d.state === 'live')?.sha;

  useEffect(() => {
    if (!open) return;
    setTags(null);
    fetch(`/api/registry/tags?repo=${encodeURIComponent(image)}`)
      .then((r) => r.json())
      .then((b: { tags?: string[] }) => {
        const list = b.tags ?? [];
        setTags(list);
        setTag(list.find((t) => t !== live) ?? list[0] ?? null);
      })
      .catch(() => setTags([]));
  }, [open, image, live]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={btn.primary} disabled={busy(project, service)}>
        <Rocket /> Deploy
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-[20vh] left-1/2 z-50 w-[440px] -translate-x-1/2 rounded-2xl border border-raised-line bg-raised p-6 shadow-pop transition-[scale,opacity] duration-200 ease-[var(--ease-out)] data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0">
          <Dialog.Title className="font-display text-[20px] font-semibold tracking-tight">
            Deploy {project}/{service}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[14px] text-fg-3">
            Pick an image from the registry. The engine starts it next to the running one and switches over without dropping requests.
          </Dialog.Description>
          <fieldset className="mt-5 space-y-1.5" aria-label="Image tag">
            {tags === null && <p className="py-3 text-[14px] text-fg-3">Loading tags from the registry…</p>}
            {tags?.length === 0 && (
              <p className="py-3 text-[14px] text-fg-3">No tags for {image}. Run `pnpm infra:demo` to push the demo images.</p>
            )}
            {tags?.map((t) => (
              <label
                key={t}
                className={cx(
                  'flex w-full cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-accent',
                  tag === t ? 'border-accent bg-accent-soft' : 'border-line hover:border-fg-3',
                )}
              >
                <input type="radio" name="tag" value={t} checked={tag === t} onChange={() => setTag(t)} className="sr-only" />
                <span className="font-mono text-[13.5px]">
                  {image}:{t}
                </span>
                <span className="flex items-center gap-2 text-[13px] text-fg-3">
                  {t === live && 'running now'}
                  {tag === t && <Check size={16} weight="bold" className="pop-in text-accent" />}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className={btn.ghost}>Cancel</Dialog.Close>
            <button
              type="button"
              className={btn.primary}
              disabled={!tag}
              onClick={() => {
                if (!tag) return;
                setOpen(false);
                deploy(project, service, undefined, tag);
              }}
            >
              <Rocket /> Deploy {tag ?? ''}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Shown on real projects when the engine does not answer. */
export function EngineNotice() {
  const { engineUp } = useDemo();
  if (engineUp !== false) return null;
  return (
    <p className="fade-in rounded-2xl border border-warn/35 bg-warn/10 px-5 py-3.5 text-[14.5px]">
      The engine is not answering. Start it with <span className="font-mono text-[13px]">pnpm dev:engine</span> and the dev stack with{' '}
      <span className="font-mono text-[13px]">pnpm infra:up</span>.
    </p>
  );
}
