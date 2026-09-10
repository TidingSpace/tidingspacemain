import { COLORS, FONT } from '@/lib/designTokens';

// icon is optional and opt-in — every existing call site (10 of them across
// the app) omits it and renders exactly as before. Added for Search's empty
// state, which needed a leading icon above the message.
export default function EmptyState({ message, icon }: { message: string; icon?: string }) {
  return (
    <div style={{ textAlign: 'center', color: COLORS.textFaint, padding: '40px 24px', fontSize: FONT.caption.fontSize, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
      {icon && <div style={{ fontSize: 30, marginBottom: 10 }}>{icon}</div>}
      {message}
    </div>
  );
}
