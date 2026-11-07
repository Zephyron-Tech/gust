import { server } from '@gust/contracts/sample';

import { PageHead, Panel } from '@/components/ui';

export const metadata = { title: 'Settings' };

const sections: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Gust',
    rows: [
      ['Version', 'gust 0.1.0 · up to date'],
      ['Server', `${server.plan} · ${server.vcpu} vCPU · ${server.ramGb} GB · ${server.os}`],
      ['Address', `gust.zephyron.tech · ${server.ip}`],
    ],
  },
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
      ['Wildcard DNS', 'Cloudflare token · *.preview.zephyron.tech'],
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
    <div className="view-in space-y-5">
      <PageHead title="Settings" />
      <div className="grid max-w-4xl gap-4">
        {sections.map((s) => (
          <Panel key={s.title} className="p-5">
            <h2 className="mb-3 font-sans text-[14px] font-medium tracking-normal">{s.title}</h2>
            <dl className="grid grid-cols-[190px_1fr] gap-x-6 gap-y-2.5 text-[13.5px]">
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
