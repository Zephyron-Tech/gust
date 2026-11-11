import { CheckCircle, Info, WarningCircle } from '@phosphor-icons/react/ssr';

import type { Banner } from './useRegistryJob';

const tone = {
  ok: { box: 'border-ok/35 bg-ok/10 text-ok', Icon: CheckCircle },
  err: { box: 'border-err/35 bg-err/10 text-err', Icon: WarningCircle },
  info: { box: 'border-line bg-bg-2 text-fg-2', Icon: Info },
} as const;

/** The result of the last registry action, shown until the next one. Clearly visible, not a toast. */
export function RegistryBanner({ banner }: { banner: Banner }) {
  const { box, Icon } = tone[banner.tone];
  return (
    <p role="status" className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[14px] font-medium ${box}`}>
      <Icon size={18} weight="fill" className="mt-0.5 shrink-0" />
      <span>{banner.text}</span>
    </p>
  );
}
