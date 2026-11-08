/** Where people open Gust, for links handed to GitHub. */
export const publicUrl = () => (process.env.GUST_PUBLIC_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3100').replace(/\/$/, '');

export const deploymentUrl = (project: string, service: string, id: string) =>
  `${publicUrl()}/projects/${project}/${service}/deployments/${id}`;
