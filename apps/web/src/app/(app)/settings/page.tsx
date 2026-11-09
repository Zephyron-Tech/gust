import { UpdatePanel } from '@/components/UpdatePanel';
import { PageHead, Panel } from '@/components/ui';
import { serverIp } from '@/lib/public-url';

export const metadata = { title: 'Settings' };

// `-` marks a value that is not implemented yet. Each one is a to-do, not a
// status: nothing listed as `-` is running.
const gustRows: [string, string][] = [
  ['Server', '-'],
  ['Address', `gust.zephyron.tech · ${serverIp() ?? '-'}`],
];

const sections: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Sign-in',
    rows: [
      ['Provider', 'Authentik OIDC · auth.zephyron.tech'],
      ['Break-glass account', 'on, for when Authentik is down'],
      ['Roles', 'admin: everything · member: deploys and logs, no secrets'],
    ],
  },
  {
    title: 'Integrations',
    rows: [
      ['GitHub App', '-'],
      ['Wildcard DNS', '-'],
      ['Registry', '-'],
    ],
  },
  {
    title: 'Alerts and backups',
    rows: [
      ['Push', '-'],
      ['Discord', '-'],
      ['Heartbeat', '-'],
      ['Backups', '-'],
      ['Image cleanup', '-'],
    ],
  },
];

export default function SettingsPage() {
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
