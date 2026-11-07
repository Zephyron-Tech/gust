import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@gust/contracts', '@gust/db'],
  serverExternalPackages: ['pg'],
};

export default config;
