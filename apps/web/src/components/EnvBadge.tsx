import type { Environment } from '@gust/contracts';
import { GitBranch, Globe } from '@phosphor-icons/react/ssr';

import { cx } from './ui';

/**
 * Which environment something belongs to. Production is a solid neutral
 * badge, a preview an outlined one with its branch. Neither uses status or
 * accent colours: the environment is not a state and not an action.
 */
export function EnvBadge({ env, className }: { env: Environment; className?: string }) {
  const base =
    'inline-flex w-max max-w-full items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[12.5px] leading-none font-medium [&_svg]:size-3.5 [&_svg]:shrink-0';
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
      <span className="truncate">Preview · {env.branch}</span>
    </span>
  );
}
