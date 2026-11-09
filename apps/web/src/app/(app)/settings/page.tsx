import type { ReactNode } from 'react';

import { LocalTime } from '@/components/LocalTime';
import { UpdatePanel } from '@/components/UpdatePanel';
import { PageHead, Panel } from '@/components/ui';
import { readLastBackup, readServerFacts } from '@/lib/host-files';
import {
  authentikValue,
  backupSizeKb,
  breakGlassValue,
  githubAppValue,
  heartbeatValue,
  NOT_SET,
  registryValue,
  rolesValue,
  serverFactsValue,
} from '@/lib/integrations';
import { serverIp } from '@/lib/public-url';

export const metadata = { title: 'Settings' };

// Read at request time: the values come from the environment and the backup record.
export const dynamic = 'force-dynamic';

// Each value is read from configuration. `-` means it is not set up here, or
// the feature does not exist yet (no code behind it).
export default async function SettingsPage() {
  const env = process.env;
  const lastBackup = await readLastBackup();
  const facts = await readServerFacts();

  const gustRows: [string, string][] = [
    ['Server', serverFactsValue(facts)],
    ['Address', `${env.GUST_DOMAIN ?? NOT_SET} · ${serverIp() ?? NOT_SET}`],
  ];

  const backupRow: ReactNode = lastBackup ? (
    <>
      Last <LocalTime iso={lastBackup.at} /> · {backupSizeKb(lastBackup.bytes)} KB · on this server only
    </>
  ) : (
    'No backup yet · on this server only'
  );

  const sections: { title: string; rows: [string, ReactNode][] }[] = [
    {
      title: 'Sign-in',
      rows: [
        ['Provider', authentikValue(env.AUTHENTIK_ISSUER)],
        ['Break-glass account', breakGlassValue(env.BREAK_GLASS_EMAIL)],
        ['Roles', rolesValue(env.GUST_ADMIN_GROUP)],
      ],
    },
    {
      title: 'Integrations',
      rows: [
        ['GitHub App', githubAppValue(env.GITHUB_APP_ID, env.GITHUB_APP_KEY_SET === 'yes', env.GITHUB_ALLOWED_OWNERS)],
        ['Wildcard DNS', NOT_SET],
        ['Registry', registryValue(env.REGISTRY_DOMAIN)],
      ],
    },
    {
      title: 'Alerts and backups',
      rows: [
        ['Push', NOT_SET],
        ['Discord', NOT_SET],
        ['Heartbeat', heartbeatValue(env.HEARTBEAT_SET === 'yes')],
        ['Backups', backupRow],
        ['Image cleanup', NOT_SET],
      ],
    },
  ];

  return (
    <div className="view-in space-y-7">
      <PageHead title="Settings" />
      <div className="grid min-w-0 max-w-4xl grid-cols-[minmax(0,1fr)] gap-4">
        <UpdatePanel rows={gustRows} />
        {sections.map((s) => (
          <Panel key={s.title} className="p-6">
            <h2 className="mb-4 font-display text-[17px]">{s.title}</h2>
            <dl className="grid grid-cols-[200px_1fr] gap-x-8 gap-y-3 text-[14.5px]">
              {s.rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-3">{k}</dt>
                  <dd className="text-fg-2">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        ))}
      </div>
    </div>
  );
}
