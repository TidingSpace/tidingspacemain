import './globals.css';
import { Inter } from 'next/font/google';
import { TimeFormatProvider } from '@/lib/timeFormat';
import PresenceHeartbeat from '@/components/PresenceHeartbeat';
import AppOpenedTracker from '@/components/AppOpenedTracker';
import { BottomNavVisibilityProvider } from '@/lib/bottomNavVisibility';
import PersistentBottomNav from '@/components/PersistentBottomNav';

// Actually loads and self-hosts Inter (Next.js downloads and optimizes the
// font files at build time, serving them from this app's own domain — no
// request to Google Fonts at runtime, no layout shift waiting on it).
// Previously this app only ever wrote fontFamily: 'Inter, sans-serif' as a
// plain string with no font actually loaded anywhere — since essentially no
// device has "Inter" pre-installed as a system font, that silently fell
// back to each browser's generic default the entire time.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Tiding Space',
  description: 'Discover, create, and join real-world activities.',
  // iOS Safari doesn't fully respect the web manifest (app/manifest.ts) —
  // these Apple-specific tags are what actually make "Add to Home Screen"
  // launch without Safari's own address bar/toolbar there, and give it a
  // matching status bar instead of the default black/white.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tiding Space'
  }
};

// Next.js 14's dedicated viewport export, not a manually-written meta tag.
// viewport-fit=cover is what allows content to extend into the safe areas
// on notched/Dynamic-Island devices — paired with the env(safe-area-inset-*)
// padding added in globals.css, so content doesn't get clipped behind them.
// maximumScale/userScalable are off deliberately: this is an app, not a
// document meant to be pinch-zoomed, and leaving pinch-zoom on is one of
// the more common things that makes a mobile web app feel like a website
// instead of a native app.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#7A5AF8'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ margin: 0, fontFamily: 'var(--font-inter), sans-serif' }}>
        <TimeFormatProvider>
          <PresenceHeartbeat />
          <AppOpenedTracker />
          <BottomNavVisibilityProvider>
            {children}
            <PersistentBottomNav />
          </BottomNavVisibilityProvider>
        </TimeFormatProvider>
      </body>
    </html>
  );
}
