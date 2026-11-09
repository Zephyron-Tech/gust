// What Settings shows for each integration, built only from configuration that
// really exists. A missing value is `-`; nothing here is written as text that
// merely sounds right. No server-only imports, so the rules can be tested.

export const NOT_SET = '-';

export type LastBackup = { at: string; bytes: number } | null;

export function authentikValue(issuer: string | undefined): string {
  if (!issuer) return NOT_SET;
  try {
    return `${new URL(issuer).host} · OIDC`;
  } catch {
    return NOT_SET;
  }
}

export function breakGlassValue(email: string | undefined): string {
  return email ? `on · ${email}` : NOT_SET;
}

export function rolesValue(adminGroup: string | undefined): string {
  return adminGroup ? `Authentik group ${adminGroup} → admin · others → member` : NOT_SET;
}

export function githubAppValue(appId: string | undefined, keySet: boolean, owners: string | undefined): string {
  if (!appId) return NOT_SET;
  if (!keySet) return `App ${appId} · private key missing`;
  return owners ? `App ${appId} · owners ${owners}` : `App ${appId}`;
}

export function registryValue(domain: string | undefined): string {
  return domain ? `${domain} · one push account for all projects` : NOT_SET;
}

export function backupValue(last: LastBackup): string {
  if (!last) return 'No backup yet · on this server only';
  const kb = Math.max(1, Math.round(last.bytes / 1024));
  const when = new Date(last.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return `Last ${when} · ${kb} KB · on this server only`;
}

/** Parses backup.json as `gust backup` writes it; anything odd counts as no backup. */
export function parseLastBackup(raw: string | null): LastBackup {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { at?: unknown; bytes?: unknown };
    if (typeof v.at !== 'string' || Number.isNaN(Date.parse(v.at))) return null;
    return { at: v.at, bytes: typeof v.bytes === 'number' ? v.bytes : 0 };
  } catch {
    return null;
  }
}
