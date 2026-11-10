import type { Environment } from '@gust/contracts';
import { GitBranch, Globe } from '@phosphor-icons/react/ssr';

import { cx } from './ui';

/**
 * Which environment something belongs to. Production is a solid neutral
 * badge, a preview an outlined one. The branch is in the tooltip. Neither uses status or
 * accent colours: the environment is not a state and not an action.
 */
export function EnvBadge({ env, className }: { env: Environment; className?: string }) {
  const base =
    'inline-flex w-max max-w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13.5px] leading-none font-medium [&_svg]:size-4 [&_svg]:shrink-0';
  if (env.kind === 'production')
    return (
      <span className={cx(base, 'bg-bg-3 text-fg', className)}>
        <Globe weight="bold" aria-hidden />
        Production
      </span>
    );
  return (
    <span className={cx(base, 'border border-dashed border-fg-3/60 text-fg-2', className)} title={`Preview of ${env.branch}`}>
      <GitBranch weight="bold" aria-hidden />
      <span>Preview</span>
    </span>
  );
}
