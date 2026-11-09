import { notFound } from 'next/navigation';

import { SetupChecklist } from '@/components/SetupChecklist';
import { getProject } from '@/lib/data';
import { newFileUrl, workflowYaml } from '@/lib/github-repo-logic';
import { GithubError, repoDetail } from '@/lib/github-repos';
import { publicUrl } from '@/lib/public-url';

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
  let problem: string | null = null;
  try {
    workflow = (await repoDetail(repo, fresh !== undefined)).workflow;
  } catch (e) {
    if (!(e instanceof GithubError)) throw e;
    problem = e.message;
  }

  const yaml = workflowYaml({ gustUrl: publicUrl(), project: slug, service, branches: [production, ...(project.previewBranches ?? [])] });
  return (
    <SetupChecklist
      slug={slug}
      service={service}
      repo={repo}
      host={project.domain}
      workflow={workflow}
      problem={problem}
      yaml={yaml}
      workflowPath={WORKFLOW_PATH}
      createUrl={newFileUrl(repo, production, WORKFLOW_PATH, yaml)}
      secretsUrl={`https://github.com/organizations/${repo.split('/')[0]}/settings/secrets/actions`}
    />
  );
}
