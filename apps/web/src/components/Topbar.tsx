'use client';

import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { projects } from '@gust/contracts/sample';
import { MagnifyingGlass, Moon, SignOut, Sun } from '@phosphor-icons/react/ssr';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { useDemo } from '@/lib/demo';
import { Kbd } from './ui';

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('gust-theme', next);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    setTheme(next);
  };
  return { theme, toggle };
}

export function Topbar() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data } = authClient.useSession();
  const me = data?.user as { name: string; email: string; role?: string } | undefined;
  const initials = (me?.name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg px-8">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-[380px] items-center gap-2.5 rounded-[10px] border border-line bg-bg-2 px-3 text-[14px] text-fg-3 transition-[border-color,background-color,color] duration-150 hover:border-fg-3 hover:bg-bg-3/60 hover:text-fg-2"
      >
        <MagnifyingGlass size={18} />
        Search projects, deploys, actions
        <span className="ml-auto">
          <Kbd>⌘K</Kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="grid size-10 place-items-center rounded-[10px] text-fg-2 transition-[background-color,color] duration-150 hover:bg-bg-3 hover:text-fg active:bg-line"
        >
          <span key={theme} className="icon-swap block">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </span>
        </button>
        <Menu.Root>
          <Menu.Trigger className="ml-1 grid size-9 place-items-center rounded-full bg-accent font-display text-[13px] font-semibold text-accent-ink transition-[box-shadow] duration-200 ease-[var(--ease-out)] hover:ring-4 hover:ring-accent/20 data-popup-open:ring-4 data-popup-open:ring-accent/25">
            {initials}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={10} align="end" className="z-50">
              <Menu.Popup className="min-w-56 origin-[var(--transform-origin)] rounded-xl border border-raised-line bg-raised p-1.5 text-[14.5px] shadow-pop transition-[scale,opacity,translate] duration-200 ease-[var(--ease-out)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:scale-95 data-starting-style:opacity-0">
                <div className="mb-1 border-b border-raised-line px-2.5 pt-1.5 pb-2.5">
                  <p className="text-fg">{me?.name ?? 'Signed in'}</p>
                  <p className="text-[13px] text-fg-3">
                    {me?.email} · {me?.role ?? 'member'}
                  </p>
                </div>
                <Menu.Item
                  onClick={async () => {
                    await authClient.signOut();
                    router.replace('/login');
                    router.refresh();
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-fg-2 outline-none transition-colors duration-100 data-highlighted:bg-bg-3 data-highlighted:text-fg"
                >
                  <SignOut size={18} /> Sign out
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <CommandPalette open={open} onOpenChange={setOpen} onTheme={toggle} />
    </header>
  );
}

function CommandPalette({ open, onOpenChange, onTheme }: { open: boolean; onOpenChange: (v: boolean) => void; onTheme: () => void }) {
  const router = useRouter();
  const { deploy } = useDemo();
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const item =
    'flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14.5px] text-fg-2 transition-colors duration-100 data-[selected=true]:bg-bg-3 data-[selected=true]:text-fg';
  const group =
    '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[12.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-3';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-[18vh] left-1/2 z-50 w-[600px] -translate-x-1/2 overflow-hidden rounded-2xl border border-raised-line bg-raised shadow-pop transition-[scale,opacity] duration-200 ease-[var(--ease-out)] data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0">
          <Dialog.Title className="sr-only">Command menu</Dialog.Title>
          <Command loop>
            <div className="flex items-center gap-2.5 border-b border-raised-line px-4">
              <MagnifyingGlass size={19} className="text-fg-3" />
              <Command.Input
                placeholder="Type a command or search"
                className="h-14 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-3"
              />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="max-h-[360px] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-fg-3">Nothing found.</Command.Empty>
              <Command.Group heading="Go to" className={group}>
                {[
                  ['Projects', '/projects'],
                  ['Server', '/server'],
                  ['Observed stacks', '/observed'],
                  ['Registry', '/registry'],
                  ['Settings', '/settings'],
                ].map(([l, h]) => (
                  <Command.Item key={h} className={item} onSelect={() => run(() => router.push(h as string))}>
                    {l}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Projects" className={group}>
                {projects.map((p) => (
                  <Command.Item
                    key={p.slug}
                    value={`project ${p.slug}`}
                    className={item}
                    onSelect={() => run(() => router.push(`/projects/${p.slug}/${p.services[0]?.name}/deployments`))}
                  >
                    {p.slug}
                    <span className="ml-auto text-[13px] text-fg-3">{p.domain}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Actions" className={group}>
                <Command.Item className={item} onSelect={() => run(() => deploy('smart-targets', 'api'))}>
                  Redeploy smart-targets/api
                </Command.Item>
                <Command.Item className={item} onSelect={() => run(onTheme)}>
                  Toggle light and dark theme
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
