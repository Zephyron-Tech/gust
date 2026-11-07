import type { Metadata } from 'next';
import { Sora } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

const sora = Sora({ subsets: ['latin', 'latin-ext'], weight: ['600'], variable: '--font-sora', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Gust', template: '%s · Gust' },
  description: 'Deploys, domains, logs and monitoring for our VPS.',
  robots: { index: false, follow: false },
};

// Sets the saved theme before the first paint, so a light-theme user never
// sees a dark flash. Dark is the default.
const themeScript = `try{var t=localStorage.getItem('gust-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={sora.variable} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
