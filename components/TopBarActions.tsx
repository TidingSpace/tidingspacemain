'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { COLORS } from '@/lib/designTokens';

export default function TopBarActions({
  avatarInitials,
  onBellClick
}: {
  avatarInitials: string;
  onBellClick?: () => void;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/notifications/unread-count')
      .then((r) => r.json())
      .then((json) => setUnreadCount(json.count ?? 0))
      .catch(() => {});

    // Self-contained fetch for the real avatar photo, so every page using this
    // component gets it automatically without threading avatar_url through
    // each page's own props.
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      fetch(`/api/profiles/${data.user.id}`)
        .then((r) => r.json())
        .then((json) => setAvatarUrl(json.profile?.avatar_url ?? null))
        .catch(() => {});
    });
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Link
        href="/notifications"
        onClick={onBellClick}
        style={{
          position: 'relative', background: '#fff', border: 'none', width: 38, height: 38,
          borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(20,10,40,0.1)', cursor: 'pointer', textDecoration: 'none'
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3, background: COLORS.danger, color: '#fff',
            fontSize: 9.5, fontWeight: 700, borderRadius: 8, minWidth: 15, height: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff'
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Link>
      <Link href="/profile" style={{ width: 38, height: 38, borderRadius: 12, overflow: 'hidden', textDecoration: 'none', display: 'block' }}>
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={38} height={38} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%', background: COLORS.violet, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13
          }}>
            {avatarInitials}
          </div>
        )}
      </Link>
    </div>
  );
}
