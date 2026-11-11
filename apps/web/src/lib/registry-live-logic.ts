import { PR_BRANCH, PR_IMAGE_SUFFIX } from '@gust/contracts';

/** The registry repository a deploy of this service image and branch pulls from. */
export function repoOfDeploy(image: string, branch: string | null): string {
  return branch !== null && PR_BRANCH.test(branch) ? `${image}${PR_IMAGE_SUFFIX}` : image;
}

/** The service images whose deploys can live in this registry repository: itself, and without the PR suffix. */
export function imagesForRepo(repo: string): string[] {
  return repo.endsWith(PR_IMAGE_SUFFIX) ? [repo, repo.slice(0, -PR_IMAGE_SUFFIX.length)] : [repo];
}
