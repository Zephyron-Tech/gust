'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { cx } from '@/components/ui';
import { useIndicator } from '@/lib/useIndicator';

/** Overview, Data and Query of one database. Redis has only Overview, so the caller passes what applies. */
export function StorageTabs({ base, tabs }: { base: string; tabs: { key: string; label: string }[] }) {
  const path = usePathname();
  const [pending, setPending] = useState<{ tab: string; from: string } | null>(null);
  const current = tabs.find((t) => (t.key === 'overview' ? path === base : path === `${base}/${t.key}`))?.key ?? null;
  const active = pending && pending.from === path ? pending.tab : current;
  const { ref, style } = useIndicator<HTMLElement>(active);
  return (
    <nav ref={ref} aria-label="Database" className="relative flex gap-1 border-b border-line">
      <span aria-hidden className="absolute top-0 left-0 rounded-full bg-accent" style={style('underline')} />
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === 'overview' ? base : `${base}/${t.key}`}
          data-key={t.key}
          onClick={() => setPending({ tab: t.key, from: path })}
          aria-current={active === t.key ? 'page' : undefined}
          className={cx('px-3.5 py-3 text-[15px] transition-colors duration-200', active === t.key ? 'text-fg' : 'text-fg-2 hover:text-fg')}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
