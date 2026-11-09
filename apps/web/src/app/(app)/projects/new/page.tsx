import { headers } from 'next/headers';

import { ImportRepoList } from '@/components/ImportRepoList';
import { PageHead, Panel } from '@/components/ui';
import { currentUser } from '@/lib/auth';
import { allowedOwners } from '@/lib/github-repo-logic';

export const metadata = { title: 'New project' };

export const dynamic = 'force-dynamic';

export default async function NewProjectPage() {
  const u = await currentUser(await headers());
  return (
    <div className="view-in space-y-7">
      <PageHead
        title="Import a repository"
        sub="Pick the repository to deploy. Next you check its settings, then connect GitHub Actions."
      />
      {u?.role === 'admin' ? (
        <ImportRepoList owners={allowedOwners()} />
      ) : (
        <Panel className="max-w-2xl p-6 text-[14.5px] text-fg-2">Only admins can add projects.</Panel>
      )}
    </div>
  );
}
