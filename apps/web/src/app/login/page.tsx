import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { GustMark } from '@/components/GustMark';
import { authentikEnabled, currentUser } from '@/lib/auth';
import { SignIn } from './SignIn';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  // Only same-site paths, so the redirect after sign-in cannot leave Gust.
  const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/projects';
  if (await currentUser(await headers())) redirect(target);

  return (
    <main className="grid min-h-svh place-items-center px-6">
      <div className="w-full max-w-[380px] space-y-8">
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <GustMark size={60} />
          </div>
          <div className="space-y-1">
            <h1 className="text-[28px]">Sign in to Gust</h1>
            <p className="text-[14.5px] text-fg-3">
              by <span className="font-display font-semibold text-fg-2">Zephyron</span>
            </p>
          </div>
        </div>
        <SignIn authentik={authentikEnabled} next={target} callbackError={error?.slice(0, 64)} />
      </div>
    </main>
  );
}
