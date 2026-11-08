'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { btn } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

const field = 'h-10 w-full rounded-[10px] border border-line bg-bg px-3 text-[15px] outline-none transition-colors focus:border-accent';

// Better Auth sends a failed Authentik sign-in back to /login?error=<code>.
const authentikErrors: Record<string, string> = {
  account_not_linked: 'This email already belongs to another Gust account.',
  state_mismatch: 'The sign-in took too long or was opened in another window. Try again.',
  please_restart_the_process: 'The sign-in took too long or was opened in another window. Try again.',
};

function authentikMessage(code: string) {
  return authentikErrors[code] ?? `Authentik sign-in failed (${code}). Try again.`;
}

export function SignIn({ authentik, next, callbackError }: { authentik: boolean; next: string; callbackError?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [authentikError, setAuthentikError] = useState<string | null>(callbackError ? authentikMessage(callbackError) : null);
  const [pending, setPending] = useState(false);

  async function viaAuthentik() {
    setPending(true);
    setAuthentikError(null);
    const { error } = await authClient.signIn.social({ provider: 'authentik', callbackURL: next, errorCallbackURL: '/login' });
    // On success the browser is already on its way to Authentik.
    if (!error) return;
    setPending(false);
    setAuthentikError(
      error.status === 429 ? 'Too many attempts. Wait a few seconds and try again.' : 'Could not reach Authentik. Try again.',
    );
  }

  async function breakGlass(form: HTMLFormElement) {
    const data = new FormData(form);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email: String(data.get('email')), password: String(data.get('password')) });
    setPending(false);
    if (error) {
      setError(error.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'Wrong email or password.');
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={!authentik || pending}
        onClick={() => void viaAuthentik()}
        className={`${btn.primary} h-11 w-full text-[15px]`}
      >
        Continue with Authentik
      </button>
      {authentikError && (
        <p role="alert" className="fade-in text-center text-[13.5px] text-err">
          {authentikError}
        </p>
      )}
      {!authentik && (
        <p className="text-center text-[13.5px] text-fg-3">
          Authentik is not configured here. Set AUTHENTIK_ISSUER and AUTHENTIK_CLIENT_ID.
        </p>
      )}
      <details className="group rounded-2xl border border-line bg-bg-2 px-5 py-4 text-[14px]" open={!authentik}>
        <summary className="cursor-pointer list-none text-fg-2 marker:hidden">Authentik is down? Use the break-glass account</summary>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void breakGlass(e.currentTarget);
          }}
        >
          <label className="block space-y-1">
            <span className="text-fg-3">Email</span>
            <input name="email" type="email" required autoComplete="username" className={field} />
          </label>
          <label className="block space-y-1">
            <span className="text-fg-3">Password</span>
            <input name="password" type="password" required autoComplete="current-password" className={field} />
          </label>
          {error && (
            <p role="alert" className="fade-in text-[13.5px] text-err">
              {error}
            </p>
          )}
          <button type="submit" disabled={pending} className={`${btn.secondary} w-full`}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </details>
    </div>
  );
}
