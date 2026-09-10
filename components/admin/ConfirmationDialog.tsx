import { COLORS, RADIUS, SHADOW } from '@/lib/designTokens';

// The one confirmation dialog every destructive admin action routes
// through — suspend, ban, delete, hide. Nothing in the admin panel should
// perform one of these actions from a bare click with no confirmation step.
export default function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  loading,
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: RADIUS.lg, boxShadow: SHADOW.raised, padding: 24, width: 380, maxWidth: 'calc(100vw - 40px)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>{title}</div>
        <p style={{ fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.5, marginBottom: 20 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{ padding: '9px 16px', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.textSecondary, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '9px 16px', borderRadius: RADIUS.sm, border: 'none', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
              background: danger ? COLORS.danger : COLORS.violet, color: '#fff'
            }}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
