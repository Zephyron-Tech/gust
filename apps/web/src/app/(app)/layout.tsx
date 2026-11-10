import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Providers } from '@/components/Providers';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { currentUser } from '@/lib/auth';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // The proxy only checks that a session cookie exists; this checks the session.
  if (!(await currentUser(await headers()))) redirect('/login');
  return (
    <Providers>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-[10px] focus:bg-accent focus:px-4 focus:py-2 focus:text-[14px] focus:font-medium focus:text-accent-ink"
      >
        Skip to content
      </a>
      <div className="flex min-h-svh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
            {children}
          </main>
        </div>
      </div>
    </Providers>
  );
}
