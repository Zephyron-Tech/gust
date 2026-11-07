import Link from 'next/link';

import { GustMark } from '@/components/GustMark';
import { btn } from '@/components/ui';
import { BreakGlass } from './BreakGlass';

export const metadata = { title: 'Sign in' };

// Sign-in goes through Authentik. The break-glass form is for when Authentik
// itself is down; both only lead into the sample UI for now.
export default function LoginPage() {
  return (
    <main className="grid min-h-svh place-items-center px-6">
      <div className="w-full max-w-[360px] space-y-8">
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <GustMark size={52} />
          </div>
          <div className="space-y-1">
            <h1 className="text-[24px]">Sign in to Gust</h1>
            <p className="text-[13.5px] text-fg-3">
              by <span className="font-display font-semibold text-fg-2">Zephyron</span>
            </p>
          </div>
        </div>
        <Link href="/projects" className={`${btn.primary} h-10 w-full text-[14px]`}>
          Continue with Authentik
        </Link>
        <details className="group rounded-xl border border-line bg-bg-2 px-4 py-3 text-[13px]">
          <summary className="cursor-pointer list-none text-fg-2 marker:hidden">Authentik is down? Use the break-glass account</summary>
          <BreakGlass>
            <label className="block space-y-1">
              <span className="text-fg-3">Username</span>
              <input
                name="user"
                autoComplete="username"
                className="h-9 w-full rounded-lg border border-line bg-bg px-3 outline-none focus:border-accent"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-fg-3">Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                className="h-9 w-full rounded-lg border border-line bg-bg px-3 outline-none focus:border-accent"
              />
            </label>
            <button type="submit" className={`${btn.secondary} w-full`}>
              Sign in
            </button>
          </BreakGlass>
        </details>
      </div>
    </main>
  );
}
