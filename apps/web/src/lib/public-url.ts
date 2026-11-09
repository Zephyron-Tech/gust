/** Where people open Gust, for links handed to GitHub. */
export const publicUrl = () => (process.env.GUST_PUBLIC_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3100').replace(/\/$/, '');

/** The public IP of the server Gust runs on, set in /opt/gust/.env; null until it is set. */
export const serverIp = (): string | null => process.env.GUST_SERVER_IP?.trim() || null;

export const deploymentUrl = (project: string, service: string, id: string) =>
  `${publicUrl()}/projects/${project}/${service}/deployments/${id}`;
