'use client';

import { COLORS } from '@/lib/designTokens';

export default function PostActionsRow({
  commentCount,
  repostCount,
  likeCount,
  liked,
  saved,
  reposted,
  onLike,
  onSave,
  onShare,
  onRepost
}: {
  commentCount: number;
  repostCount: number;
  likeCount: number;
  liked: boolean;
  saved: boolean;
  reposted?: boolean;
  onLike: (e: React.MouseEvent) => void;
  onSave: (e: React.MouseEvent) => void;
  onShare: (e: React.MouseEvent) => void;
  onRepost?: (e: React.MouseEvent) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: COLORS.textFaint, fontSize: 12.5, fontWeight: 600 }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        {commentCount}
      </div>

      <div
        onClick={onRepost}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600,
          cursor: onRepost ? 'pointer' : 'default',
          color: reposted ? COLORS.success : COLORS.textFaint
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
        {repostCount}
      </div>

      <div onClick={onLike} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: liked ? COLORS.like : COLORS.textFaint, fontSize: 12.5, fontWeight: 600 }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
        {likeCount}
      </div>

      <div onClick={onSave} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: saved ? COLORS.violet : COLORS.textFaint, marginLeft: 'auto' }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </div>

      <div onClick={onShare} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: COLORS.textFaint }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
        </svg>
      </div>
    </div>
  );
}
