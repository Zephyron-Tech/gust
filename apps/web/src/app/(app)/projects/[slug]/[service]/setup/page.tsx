import { registryStatus } from '@gust/db/registry';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { RegistryAccount } from '@/components/RegistryAccount';
import { SetupChecklist } from '@/components/SetupChecklist';
import { currentUser } from '@/lib/auth';
import { getProject } from '@/lib/data';
import { newFileUrl, workflowYaml } from '@/lib/github-repo-logic';
import { GithubError, repoDetail } from '@/lib/github-repos';
import { publicUrl } from '@/lib/public-url';
import { accountView } from '@/lib/registry-action';

export const metadata = { title: 'Set up deploys' };

export const dynamic = 'force-dynamic';

const WORKFLOW_PATH = '.github/workflows/gust-deploy.yml';

// Step 3 of a new project: what is left before the first deploy, Vercel's
// "next steps" for a workflow-driven deploy.
export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; service: string }>;
  searchParams: Promise<{ fresh?: string }>;
}) {
  const { slug, service } = await params;
  const { fresh } = await searchParams;
  const project = await getProject(slug);
  if (!project) notFound();
  const repo = project.repo;
  const production = project.productionBranch ?? 'main';

  let workflow: string | null = null;
  let pullRequestTrigger = false;
  let problem: string | null = null;
  try {
    const detail = await repoDetail(repo, fresh !== undefined);
    workflow = detail.workflow;
    pullRequestTrigger = detail.pullRequestTrigger;
  } catch (e) {
    if (!(e instanceof GithubError)) throw e;
    problem = e.message;
  }

  const reg = await registryStatus(slug);
  const status = accountView(reg);

  const user = await currentUser(await headers());

  const yaml = workflowYaml({ gustUrl: publicUrl(), project: slug, service, branches: [production, ...(project.previewBranches ?? [])] });
  return (
    <div className="space-y-4">
      <RegistryAccount slug={slug} status={status ?? null} canManage={user?.role === 'admin'} />
      <SetupChecklist
        slug={slug}
        service={service}
        repo={repo}
        host={project.domain}
        workflow={workflow}
        pullRequestTrigger={pullRequestTrigger}
        problem={problem}
        yaml={yaml}
        workflowPath={WORKFLOW_PATH}
        createUrl={newFileUrl(repo, production, WORKFLOW_PATH, yaml)}
      />
    </div>
  );
}
