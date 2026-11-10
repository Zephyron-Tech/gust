import { ArrowLeft } from '@phosphor-icons/react/ssr';
import Link from 'next/link';

import { btn, Panel } from '@/components/ui';

export const metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <Panel className="view-in max-w-2xl space-y-4 p-7">
      <div className="space-y-1.5">
        <h1 className="text-[22px] leading-tight">Nothing here</h1>
        <p className="text-[14.5px] text-fg-2">
          This project, service or page does not exist. It may have been deleted, or the address has a typo.
        </p>
      </div>
      <Link href="/projects" className={btn.secondary}>
        <ArrowLeft /> Back to projects
      </Link>
    </Panel>
  );
}
