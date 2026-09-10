import Image from 'next/image';
import { COLORS, AVATAR } from '@/lib/designTokens';
import VerifiedBadge from '@/components/VerifiedBadge';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const FONT_SIZE: Record<AvatarSize, number> = { sm: 10.5, md: 13, lg: 17, xl: 30 };
// The verified badge overlay scales with avatar size, kept prominent and
// clearly visible per the reference design rather than a subtle corner mark.
const BADGE_SIZE: Record<AvatarSize, number> = { sm: 16, md: 20, lg: 26, xl: 38 };

function initialsOf(name: string): string {
  return (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');
}

// Standardized on circular avatars everywhere, matching the original mockups.
// Shows a real uploaded photo (avatarUrl) when one exists, falling back to
// colored initials (color) otherwise — every existing call site that doesn't
// pass avatarUrl keeps behaving exactly as it did before.
//
// `verified` is optional and additive: passing it renders a small checkmark
// badge overlaid on the bottom-right corner, reflecting
// profiles.is_verified_organizer. Omitting it (every pre-existing call site)
// renders exactly the same bare <img>/initials element as before — this is
// the one central place that badge needed to be added for it to show up
// consistently everywhere an avatar appears, rather than patching dozens of
// individual screens by hand.
export default function Avatar({
  name,
  color,
  avatarUrl,
  size = 'md',
  pixelSize,
  verified
}: {
  name: string;
  color?: string;
  avatarUrl?: string | null;
  size?: AvatarSize;
  pixelSize?: number; // opt-in override for spots that need a size the fixed scale doesn't have (e.g. a compact stacked-avatar pile) — every existing call site omits this and uses the token scale exactly as before
  verified?: boolean;
}) {
  const dimension = pixelSize ?? AVATAR[size];

  const inner = avatarUrl ? (
    <Image
      src={avatarUrl}
      alt={name}
      width={dimension}
      height={dimension}
      // Real avatar photos get resized server-side to the actual pixel
      // size they're displayed at (not the full resolution a phone
      // camera captured), and served as a modern format when the
      // browser supports it. Avatars are small and shown constantly
      // across the app, which is exactly where this adds up the most on
      // a real mobile connection.
      style={{
        width: dimension,
        height: dimension,
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: 0
      }}
    />
  ) : (
    <div
      style={{
        width: dimension,
        height: dimension,
        borderRadius: '50%',
        background: color || COLORS.violet,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: FONT_SIZE[size],
        flexShrink: 0
      }}
    >
      {initialsOf(name)}
    </div>
  );

  if (!verified) return inner;

  return (
    <div style={{ position: 'relative', width: dimension, height: dimension, flexShrink: 0 }}>
      {inner}
      <div style={{ position: 'absolute', bottom: -2, right: -2 }}>
        <VerifiedBadge size={BADGE_SIZE[size]} />
      </div>
    </div>
  );
}
