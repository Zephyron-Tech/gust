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
      <div className="flex min-h-svh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-8 pt-8 pb-20">{children}</main>
        </div>
      </div>
    </Providers>
  );
}
