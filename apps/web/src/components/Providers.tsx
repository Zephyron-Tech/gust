'use client';

import { Toast } from '@base-ui/react/toast';
import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react/ssr';
import type { ReactNode } from 'react';

import { DemoProvider } from '@/lib/demo';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={4500} limit={3}>
      <DemoProvider>{children}</DemoProvider>
      <Toast.Portal>
        <Toast.Viewport className="fixed right-6 bottom-6 z-50 w-[380px]">
          <Toasts />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function Toasts() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => (
    <Toast.Root
      key={t.id}
      toast={t}
      className="absolute right-0 bottom-0 w-full origin-bottom rounded-xl border border-raised-line bg-raised shadow-pop [transform:translateY(calc(var(--toast-index)*-10px))_scale(calc(1-var(--toast-index)*0.05))] [transition:transform_0.35s_var(--ease-out),opacity_0.25s] data-ending-style:opacity-0 data-starting-style:[transform:translateY(120%)] data-expanded:[transform:translateY(calc(var(--toast-offset-y)*-1-var(--toast-index)*10px))]"
    >
      <Toast.Content className="flex items-start gap-3 p-4">
        {t.type === 'err' ? (
          <WarningCircle size={20} weight="fill" className="shrink-0 text-err" />
        ) : (
          <CheckCircle size={20} weight="fill" className="shrink-0 text-ok" />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <Toast.Title className="text-[14.5px] font-medium text-fg" />
          <Toast.Description className="text-[14px] text-fg-2" />
        </div>
        <Toast.Close aria-label="Dismiss" className="rounded p-0.5 text-fg-3 hover:text-fg">
          <X size={16} />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}
