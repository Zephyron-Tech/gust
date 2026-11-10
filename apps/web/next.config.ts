import type { NextConfig } from 'next';

// Sent with every response. Gust is never framed, never guesses content types
// and sends no referrer to the sites it links to. The policy is kept to the
// directives that do not need a nonce: Next's own inline scripts stay allowed.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  // Browsers ignore this over plain HTTP, so local development is not affected.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@gust/contracts', '@gust/db'],
  serverExternalPackages: ['pg', 'pg-boss'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
