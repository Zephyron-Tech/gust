'use client';

import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useEffect } from 'react';

import { btn, Code, Panel } from '@/components/ui';

// A page threw while rendering: the database or the host did not answer, or a
// bug. The digest is the id of the same error in `gust logs web`.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Panel className="view-in max-w-2xl space-y-4 p-7">
      <div className="flex items-start gap-3">
        <WarningCircle size={24} weight="fill" className="mt-0.5 shrink-0 text-err" />
        <div className="space-y-1.5">
          <h1 className="text-[22px] leading-tight">This page could not load</h1>
          <p className="text-[14.5px] text-fg-2">
            Gust could not read what the page needs, most often the database. Running apps are not affected. Try again; if it keeps failing,
            look at <Code className="text-fg">gust logs web</Code> on the server.
          </p>
          {error.digest && (
            <p className="text-[13.5px] text-fg-3">
              Error id <Code>{error.digest}</Code>
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 pl-9">
        <button type="button" onClick={reset} className={btn.primary}>
          <ArrowClockwise /> Try again
        </button>
        <Link href="/projects" className={btn.ghost}>
          Back to projects
        </Link>
      </div>
    </Panel>
  );
}
