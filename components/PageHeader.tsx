import Link from 'next/link';
import { COLORS, FONT } from '@/lib/designTokens';

// Covers both header patterns found across the app:
// - Main tab screens (Feed, Inbox, Notifications, Settings): large title, no
//   back arrow, optional right-side content (bell/avatar, gear icon, etc.)
// - Sub-pages (Blocked Accounts, Manage Attendees, etc.): back arrow + smaller
//   title, reached by navigating deeper rather than via the bottom tab bar.
export default function PageHeader({
  title,
  backHref,
  right,
  large = true
}: {
  title: string;
  backHref?: string;
  right?: React.ReactNode;
  large?: boolean; // most screens use the large page-title scale even with a back arrow (e.g. Settings) — set false for genuine sub-pages (e.g. Blocked Accounts)
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {backHref && (
          <Link href={backHref} style={{ color: COLORS.ink, textDecoration: 'none', display: 'flex' }} aria-label="Back">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
        )}
        <h1 style={{
          ...(large ? FONT.pageTitle : FONT.sectionTitle),
          color: COLORS.ink, margin: 0, letterSpacing: '-0.02em'
        }}>
          {title}
        </h1>
      </div>
      {right}
    </div>
  );
}
