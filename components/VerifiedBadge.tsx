import { COLORS } from '@/lib/designTokens';

// Shown next to an organizer's name (and as an avatar-corner badge)
// wherever verification appears publicly, reflecting
// profiles.is_verified_organizer, granted manually by an admin. Scalloped
// seal shape with a bold checkmark, matching the reference design —
// prominent and clearly visible rather than a small subtle mark.
export default function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Verified organizer">
      <path
        d="M12,1 L14.46,2.82 L17.5,2.47 L18.72,5.28 L21.53,6.5 L21.18,9.54 L23,12 L21.18,14.46 L21.53,17.5 L18.72,18.72 L17.5,21.53 L14.46,21.18 L12,23 L9.54,21.18 L6.5,21.53 L5.28,18.72 L2.47,17.5 L2.82,14.46 L1,12 L2.82,9.54 L2.47,6.5 L5.28,5.28 L6.5,2.47 L9.54,2.82 Z"
        fill={COLORS.violet}
      />
      <path d="M7.5 12.5l3 3 6-6" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
