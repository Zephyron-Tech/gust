import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gust',
    short_name: 'Gust',
    start_url: '/projects',
    display: 'standalone',
    background_color: '#0d0e16',
    theme_color: '#0d0e16',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/gust-icon-maskable-192.png', type: 'image/png', sizes: '192x192', purpose: 'maskable' },
      { src: '/gust-icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  };
}
