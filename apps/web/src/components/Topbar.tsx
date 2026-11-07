'use client';

import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { projects } from '@gust/contracts/sample';
import { MagnifyingGlass, Moon, SignOut, Sun } from '@phosphor-icons/react/ssr';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-7 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-[300px] items-center gap-2 rounded-lg border border-line bg-bg-2 px-2.5 text-[13px] text-fg-3 transition-colors hover:border-fg-3"
      >
        <MagnifyingGlass size={15} />
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
          className="grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-bg-3 hover:text-fg"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <Menu.Root>
          <Menu.Trigger className="ml-1 grid size-8 place-items-center rounded-full bg-accent font-display text-[12px] font-semibold text-accent-ink">
            JV
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={8} align="end">
              <Menu.Popup className="min-w-52 origin-[var(--transform-origin)] rounded-xl border border-line bg-bg-3 p-1 text-[13.5px] shadow-[0_16px_40px_-12px_rgb(0_0_0/0.5)] transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                <div className="px-2.5 pt-1.5 pb-2">
                  <p className="text-fg">Jan Vandlíček</p>
                  <p className="text-[12px] text-fg-3">admin · Authentik</p>
                </div>
                <Menu.Item
                  onClick={() => {
                    window.location.href = '/login';
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-fg-2 outline-none data-highlighted:bg-bg-2 data-highlighted:text-fg"
                >
                  <SignOut size={16} /> Sign out
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
  const { deploy, setDiskAlert } = useDemo();
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const item =
    'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-fg-2 data-[selected=true]:bg-bg-2 data-[selected=true]:text-fg';
  const group =
    '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:text-fg-3';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-[18vh] left-1/2 z-50 w-[560px] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-bg-3 shadow-[0_24px_60px_-16px_rgb(0_0_0/0.6)] transition-[transform,opacity] duration-150 ease-[var(--ease-out)] data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0">
          <Dialog.Title className="sr-only">Command menu</Dialog.Title>
          <Command loop>
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <MagnifyingGlass size={16} className="text-fg-3" />
              <Command.Input
                placeholder="Type a command or search"
                className="h-12 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
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
                    <span className="ml-auto font-mono text-[12px] text-fg-3">{p.domain}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Actions" className={group}>
                <Command.Item className={item} onSelect={() => run(() => deploy('smart-targets', 'api'))}>
                  Redeploy smart-targets/api
                </Command.Item>
                <Command.Item className={item} onSelect={() => run(() => setDiskAlert(true))}>
                  Simulate a full disk alert
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
