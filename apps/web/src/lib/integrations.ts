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

/** Backup size in KB, at least 1, for display. */
export function backupSizeKb(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}

export type ServerFacts = { os: string; vcpu: number; ramGb: number; diskGb: number; uptimeSec: number; at: string };

/** Parses server.json as `gust version-check` writes it; anything odd counts as unknown. */
export function parseServerFacts(raw: string | null): ServerFacts | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const vcpu = num(v.vcpu);
    const ramGb = num(v.ramGb);
    const diskGb = num(v.diskGb);
    const uptimeSec = num(v.uptimeSec);
    if (typeof v.os !== 'string' || vcpu === null || ramGb === null || diskGb === null || uptimeSec === null) return null;
    return { os: v.os, vcpu, ramGb, diskGb, uptimeSec, at: typeof v.at === 'string' ? v.at : '' };
  } catch {
    return null;
  }
}

export function serverFactsValue(f: ServerFacts | null): string {
  return f ? `${f.os} · ${f.vcpu} vCPU · ${f.ramGb} GB RAM · ${f.diskGb} GB disk` : NOT_SET;
}

export function discordValue(configured: boolean): string {
  return configured ? 'webhook set · deploy, backup and update alerts' : NOT_SET;
}

export function heartbeatValue(configured: boolean): string {
  return configured ? 'healthchecks.io · pinged after each backup' : NOT_SET;
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
