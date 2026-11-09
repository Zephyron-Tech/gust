import { headers } from 'next/headers';

import { NewProjectForm } from '@/components/NewProjectForm';
import { PageHead, Panel } from '@/components/ui';
import { currentUser } from '@/lib/auth';

export const metadata = { title: 'New project' };

export const dynamic = 'force-dynamic';

export default async function NewProjectPage() {
  const u = await currentUser(await headers());
  return (
    <div className="view-in space-y-7">
      <PageHead title="New project" sub="Creates the project and its first service. It deploys from the repository's production branch." />
      {u?.role === 'admin' ? (
        <NewProjectForm />
      ) : (
        <Panel className="max-w-2xl p-6 text-[14.5px] text-fg-2">Only admins can add projects.</Panel>
      )}
    </div>
  );
}
