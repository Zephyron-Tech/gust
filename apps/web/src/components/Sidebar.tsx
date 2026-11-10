'use client';

import type { Icon } from '@phosphor-icons/react';
import { CaretLineLeft, CaretLineRight, Cube, Database, Eye, Gear, Pulse, SquaresFour } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDemo } from '@/lib/demo';
import { readRecent, rememberProject } from '@/lib/recent-projects';
import { useFlip } from '@/lib/useFlip';
import { useIndicator } from '@/lib/useIndicator';
import { useServerMetrics } from '@/lib/useServerMetrics';
import { useUpdateStatus } from '@/lib/useUpdateStatus';
import { Beacon } from './Beacon';
import { GustMark } from './GustMark';
import { ProjectIcon } from './ProjectIcon';
import { cx, Meter } from './ui';

const nav: { href: string; label: string; icon: Icon }[] = [
  { href: '/projects', label: 'Projects', icon: SquaresFour },
  { href: '/server', label: 'Server', icon: Pulse },
  { href: '/observed', label: 'Observed stacks', icon: Eye },
  { href: '/registry', label: 'Registry', icon: Cube },
  { href: '/storage', label: 'Storage', icon: Database },
  { href: '/settings', label: 'Settings', icon: Gear },
];

// How many recent projects the sidebar lists; the Projects page has them all.
const RECENT = 3;

export function Sidebar() {
  const path = usePathname();
  const { projects } = useDemo();
  // Projects on the engine first (the API's order), and the one that is open always in view.
  const open = projects?.find((p) => path.startsWith(`/projects/${p.slug}/`) || path === `/projects/${p.slug}`);
  // The three projects this browser opened last, the open one first. Until something has been opened, the first three.
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    setRecent(readRecent());
  }, []);
  const openSlug = open?.slug;
  useEffect(() => {
    if (openSlug) setRecent(rememberProject(openSlug));
  }, [openSlug]);
  const pinned = useMemo(() => {
    if (!projects) return [];
    const bySlug = new Map(projects.map((p) => [p.slug, p]));
    const order = [...new Set([...recent, ...projects.map((p) => p.slug)])];
    return order
      .flatMap((slug) => {
        const p = bySlug.get(slug);
        return p ? [p] : [];
      })
      .slice(0, RECENT);
  }, [projects, recent]);
  const { data: metrics } = useServerMetrics('1h');
  const snap = metrics?.snapshot ?? null;
  const { status: update } = useUpdateStatus({ autoCheck: true });
  const updateAvailable = update?.available === true;
  // The highlight moves on click, before the next page has loaded, so it feels instant.
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);
  const current = nav.find((n) => path.startsWith(n.href))?.href ?? null;
  const active = pending && pending.from === path ? pending.href : current;
  // Hover slides between items; it keeps its last spot and fades out when the pointer leaves the nav.
  const [hovered, setHovered] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const { style } = useIndicator<HTMLElement>(active, navRef);
  const { style: hoverStyle } = useIndicator<HTMLElement>(hovered, navRef);
  const [pinnedHovered, setPinnedHovered] = useState<string | null>(null);
  const [pinnedHovering, setPinnedHovering] = useState(false);
  const pinnedRef = useRef<HTMLDivElement>(null);
  useFlip(pinnedRef, pinned.map((p) => p.slug).join('|'));
  const { style: pinnedHoverStyle } = useIndicator<HTMLDivElement>(pinnedHovered, pinnedRef);
  const item = 'group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14.5px] transition-[background-color,color] duration-150';

  // Collapsed on wide screens: the same icon rail as on narrow ones. Remembered per browser.
  const [collapsed, setCollapsed] = useState(false);
  // The width only animates after the saved state is applied; otherwise every page load
  // would slide the sidebar from expanded to collapsed.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('gust.sidebar') === 'collapsed');
    } catch {
      // Storage can be blocked; the sidebar then stays expanded.
    }
    setRestored(true);
  }, []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem('gust.sidebar', next ? 'collapsed' : 'expanded');
    } catch {
      // Not saved; it still works for this visit.
    }
  };
  const textClass = collapsed ? 'sr-only' : 'max-lg:sr-only';
  const hide = collapsed ? 'hidden' : 'max-lg:hidden';

  return (
    <aside
      className={cx(
        'sticky top-0 flex h-svh w-[68px] shrink-0 flex-col border-r border-line bg-bg-2 px-2.5 pt-5 pb-4 lg:px-3.5',
        !collapsed && 'lg:w-[260px]',
        // Same length and curve as the nav highlight (useIndicator), so both finish together.
        restored && 'transition-[width] duration-[280ms] ease-[var(--ease-out)]',
      )}
    >
      <Link
        href="/projects"
        className={cx(
          'mb-7 flex items-center gap-3 px-2 font-display lg:px-2.5 text-[22px] font-semibold tracking-[-0.045em]',
          collapsed && 'justify-center px-0 lg:px-0',
        )}
      >
        <GustMark size={30} />
        <span className={textClass}>gust</span>
      </Link>
      <nav ref={navRef} aria-label="Main" className="relative flex flex-col gap-0.5" onMouseLeave={() => setHovering(false)}>
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 rounded-[10px] bg-bg-3"
          style={{ ...hoverStyle('band'), opacity: hovering ? 1 : 0 }}
        />
        <span aria-hidden className="pointer-events-none absolute top-0 left-0 rounded-[10px] bg-accent-soft" style={style('band')} />
        {nav.map(({ href, label, icon: I }) => {
          const on = active === href;
          return (
            <Link
              key={href}
              href={href}
              data-key={href}
              onClick={() => setPending({ href, from: path })}
              onMouseEnter={() => {
                setHovered(href);
                setHovering(true);
              }}
              aria-current={on ? 'page' : undefined}
              className={cx('relative', item, on ? 'text-fg' : 'text-fg-2 hover:text-fg')}
            >
              <I size={20} weight={on ? 'fill' : 'regular'} className="shrink-0" />
              <span className={textClass}>{label}</span>
              {href === '/settings' && updateAvailable && (
                <span
                  className={cx(
                    'pop-in grid size-5 place-items-center rounded-full bg-accent text-[11.5px] font-semibold text-accent-ink',
                    collapsed ? 'absolute -top-0.5 -right-0.5' : 'ml-auto max-lg:absolute max-lg:-top-0.5 max-lg:-right-0.5',
                  )}
                >
                  1<span className="sr-only"> update available</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <p className={cx('mt-7 mb-2 flex items-baseline justify-between px-3 text-[12.5px] font-medium text-fg-3', hide)}>
        Recent projects
        {projects && projects.length > pinned.length && (
          <Link href="/projects" className="font-normal transition-colors hover:text-fg-2">
            all {projects.length}
          </Link>
        )}
      </p>
      <nav
        ref={pinnedRef}
        aria-label="Recent projects"
        className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto max-lg:hidden"
        onMouseLeave={() => setPinnedHovering(false)}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 rounded-[10px] bg-bg-3"
          style={{ ...pinnedHoverStyle('band'), opacity: pinnedHovering ? 1 : 0 }}
        />
        {pinned.map((p) => (
          <Link
            key={p.slug}
            href={p.href}
            data-key={p.slug}
            data-flip={p.slug}
            onMouseEnter={() => {
              setPinnedHovered(p.slug);
              setPinnedHovering(true);
            }}
            aria-current={p === open ? 'page' : undefined}
            title={collapsed ? p.slug : undefined}
            className={cx(
              'relative py-2',
              item,
              collapsed && 'justify-center px-0',
              p === open ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:text-fg',
            )}
          >
            <ProjectIcon slug={p.slug} src={p.icon} size="sm" />
            <span className={cx('min-w-0 flex-1 truncate', collapsed && 'sr-only')}>{p.slug}</span>
            <Beacon health={p.health} className={collapsed ? 'absolute top-1 right-0.5 scale-75' : undefined} />
          </Link>
        ))}
        {projects === null &&
          [68, 52, 60].map((w) => (
            <span key={w} className="flex items-center gap-3 px-3 py-2">
              <span className="skeleton size-6 rounded-md" />
              <span className={cx('skeleton h-3', collapsed && 'hidden')} style={{ width: `${w}%` }} />
            </span>
          ))}
        {projects?.length === 0 && (
          <Link href="/projects/new" className={cx(item, 'text-fg-3 hover:text-fg')}>
            Import your first repository
          </Link>
        )}
      </nav>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        className={cx(
          'mt-auto mb-2 hidden items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg-2 lg:flex',
          collapsed && 'justify-center px-0',
        )}
      >
        {collapsed ? <CaretLineRight size={18} aria-hidden /> : <CaretLineLeft size={18} aria-hidden />}
        <span className={collapsed ? 'sr-only' : undefined}>Collapse</span>
      </button>

      <Link
        href="/server"
        className={cx(
          'grid shrink-0 gap-2.5 rounded-xl bg-bg-3/60 px-3.5 py-3.5 text-[13px] text-fg-3 transition-colors hover:text-fg-2',
          hide,
        )}
      >
        <span className="flex justify-between">
          <span className="font-medium text-fg-2">{metrics?.facts?.os ?? '-'}</span>
          <span>{metrics?.facts ? `${metrics.facts.vcpu} vCPU` : '-'}</span>
        </span>
        {snap
          ? [
              ['CPU', snap.cpu, `${snap.cpu.toFixed(0)} %`, 'accent'],
              [
                'RAM',
                snap.ramTotalGb > 0 ? (snap.ramUsedGb / snap.ramTotalGb) * 100 : 0,
                `${snap.ramUsedGb.toFixed(1)} / ${snap.ramTotalGb.toFixed(1)} GB`,
                'accent',
              ],
              [
                'Disk',
                snap.diskTotalGb > 0 ? (snap.diskUsedGb / snap.diskTotalGb) * 100 : 0,
                `${snap.diskUsedGb.toFixed(0)} / ${snap.diskTotalGb.toFixed(0)} GB`,
                snap.diskTotalGb > 0 && snap.diskUsedGb / snap.diskTotalGb >= 0.9 ? 'err' : 'accent',
              ],
            ].map(([k, v, t, tone]) => (
              <span key={k as string} className="grid grid-cols-[38px_1fr_92px] items-center gap-2.5">
                <span>{k}</span>
                <Meter value={v as number} tone={tone as 'accent' | 'err'} />
                <span className="text-right tabular-nums">{t}</span>
              </span>
            ))
          : ['CPU', 'RAM', 'Disk'].map((k) => (
              <span key={k} className="grid grid-cols-[38px_1fr_92px] items-center gap-2.5">
                <span>{k}</span>
                <span />
                <span className="text-right">-</span>
              </span>
            ))}
      </Link>
    </aside>
  );
}
