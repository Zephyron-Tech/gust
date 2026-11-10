'use client';

import { Dialog } from '@base-ui/react/dialog';
import type { ReactNode } from 'react';

/**
 * A confirmation that asks before something happens. It fades and scales in
 * from the centre and leaves the same way; the backdrop softens the page behind.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  actions: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] transition-[opacity,backdrop-filter] duration-200 ease-[var(--ease-out)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-raised-line bg-raised p-6 shadow-pop transition-[scale,opacity] duration-200 ease-[var(--ease-out)] data-ending-style:scale-[0.96] data-ending-style:opacity-0 data-starting-style:scale-[0.96] data-starting-style:opacity-0">
          <Dialog.Title className="font-display text-[18px] font-semibold tracking-tight">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-[14.5px] leading-relaxed text-fg-2">{description}</Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">{actions}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
