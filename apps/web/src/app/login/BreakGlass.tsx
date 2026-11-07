'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

// The form never sends anything yet: submitting only opens the sample UI, so
// a typed password cannot end up in a URL or a log.
export function BreakGlass({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <form
      className="mt-3 space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        router.push('/projects');
      }}
    >
      {children}
    </form>
  );
}
