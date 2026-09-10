import type { MetadataRoute } from 'next';

// Next.js's native App Router way of generating manifest.webmanifest —
// this is what makes "Add to Home Screen" behave like a real app: no
// browser address bar, a proper icon, and a matching status bar color,
// instead of just bookmarking a browser tab.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tiding Space',
    short_name: 'Tiding Space',
    description: 'Discover, create, and join real-world activities.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FBFAFF',
    theme_color: '#7A5AF8',
    orientation: 'portrait',
    icons: [
      // 'any' and 'maskable' both included — confirmed this artwork is
      // genuinely full-bleed (checked the actual corner pixel color,
      // exactly #7A5AF8 with no margin), unlike the previous icon set
      // where 'maskable' was deliberately left out due to a white margin
      // around the mark. Safe to include both purposes now.
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
