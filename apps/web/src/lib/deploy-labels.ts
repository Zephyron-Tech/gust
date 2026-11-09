import type { Deployment } from '@gust/contracts';

/** How a deploy started, in a few words. The environment is shown apart, by EnvBadge. */
export function triggerLabel(d: Pick<Deployment, 'trigger' | 'branch'>) {
  switch (d.trigger) {
    case 'preview':
      return `from ${d.branch}`;
    case 'rollback':
      return 'rollback';
    case 'manual':
      return 'deployed from Gust';
    case 'reconcile':
      return 'restored by Gust';
    default:
      return `push to ${d.branch}`;
  }
}
