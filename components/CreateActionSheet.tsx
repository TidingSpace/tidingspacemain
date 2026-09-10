'use client';

import { useRouter } from 'next/navigation';
import { COLORS, RADIUS } from '@/lib/designTokens';

export default function CreateActionSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  function handleWritePost() {
    onClose();
    router.push('/create-post');
  }

  function handleCreateActivity() {
    onClose();
    router.push('/create');
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.4)',
        zIndex: 100, display: 'flex', alignItems: 'flex-end'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '24px 24px 0 0', width: '100%',
          maxWidth: 480, margin: '0 auto', padding: '10px 20px 28px 20px'
        }}
      >
        <div style={{ width: 36, height: 4, background: COLORS.border, borderRadius: RADIUS.sm, margin: '0 auto 18px auto' }} />

        <ActionRow
          icon={
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={COLORS.violetDeep} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
            </svg>
          }
          title="Write a Post"
          subtitle="Share a photo, thought or update with your community."
          onClick={handleWritePost}
        />
        <ActionRow
          icon={
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={COLORS.violetDeep} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          }
          title="Create Activity"
          subtitle="Plan something fun and invite people to join you."
          onClick={handleCreateActivity}
        />

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 8, padding: 14, borderRadius: 14,
            border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.ink,
            fontWeight: 700, fontSize: 15, cursor: 'pointer'
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ActionRow({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '16px',
        cursor: 'pointer', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, marginBottom: 12
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: '50%', background: COLORS.violetTint,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink }}>{title}</div>
        <div style={{ fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 }}>{subtitle}</div>
      </div>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}
