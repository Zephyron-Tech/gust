import type { ReactNode } from 'react';

import { Providers } from '@/components/Providers';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-svh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="mx-auto w-full max-w-[1240px] flex-1 px-7 pt-7 pb-16">{children}</main>
        </div>
      </div>
    </Providers>
  );
}
