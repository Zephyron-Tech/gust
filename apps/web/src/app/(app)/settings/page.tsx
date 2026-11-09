import { server } from '@gust/contracts/sample';
import { UpdatePanel } from '@/components/UpdatePanel';
import { PageHead, Panel } from '@/components/ui';

export const metadata = { title: 'Settings' };

const gustRows: [string, string][] = [
  ['Server', `${server.plan} · ${server.vcpu} vCPU · ${server.ramGb} GB · ${server.os}`],
  ['Address', `gust.zephyron.tech · ${server.ip}`],
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
      ['GitHub App', 'gust-zephyron · Zephyron-Tech, vandlj, clearway-dev'],
      ['Wildcard DNS', 'WEDOS WAPI · *.preview.zephyron.tech'],
      ['Registry', 'Zot · robot account per project'],
    ],
  },
  {
    title: 'Alerts and backups',
    rows: [
      ['Push', 'iPhones of admins (Gust on the home screen)'],
      ['Discord', '#ops webhook'],
      ['Heartbeat', 'healthchecks.io every minute'],
      ['Backups', 'restic → Storage Box · nightly 03:00 · last OK 6 hours ago'],
      ['Image cleanup', 'keep 5 per service · nightly'],
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
