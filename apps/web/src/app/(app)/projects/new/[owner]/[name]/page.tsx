import { ArrowSquareOut } from '@phosphor-icons/react/ssr';
import { headers } from 'next/headers';
import Link from 'next/link';

import { ConfigureProject } from '@/components/ConfigureProject';
import { PageHead, Panel } from '@/components/ui';
import { currentUser } from '@/lib/auth';
import { GithubError, repoDetail } from '@/lib/github-repos';

export const metadata = { title: 'Configure project' };

export const dynamic = 'force-dynamic';

export default async function ConfigureProjectPage({ params }: { params: Promise<{ owner: string; name: string }> }) {
  const { owner, name } = await params;
  const u = await currentUser(await headers());
  if (u?.role !== 'admin') return <Panel className="max-w-2xl p-6 text-[14.5px] text-fg-2">Only admins can add projects.</Panel>;

  let repo: Awaited<ReturnType<typeof repoDetail>> | null = null;
  let problem: string | null = null;
  try {
    repo = await repoDetail(`${owner}/${name}`);
  } catch (e) {
    if (!(e instanceof GithubError)) throw e;
    problem = e.message;
  }

  return (
    <div className="view-in space-y-7">
      <PageHead
        title="Configure project"
        sub={
          <span className="inline-flex items-center gap-2">
            Importing
            <a
              href={`https://github.com/${owner}/${name}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[13.5px] text-fg-2 hover:text-accent"
            >
              {owner}/{name} <ArrowSquareOut size={13} />
            </a>
          </span>
        }
      />
      {repo ? (
        <ConfigureProject repo={repo} gustDomain={process.env.GUST_DOMAIN ?? null} />
      ) : (
        <Panel className="max-w-2xl space-y-3 p-6 text-[14.5px]">
          <p className="text-err">{problem}</p>
          <Link href="/projects/new" className="text-accent">
            Back to the repositories
          </Link>
        </Panel>
      )}
    </div>
  );
}
