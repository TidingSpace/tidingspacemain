import { COLORS, SHADOW } from '@/lib/designTokens';

// The "..." bubble shown where the typing person's next message would
// actually land — reused identically across DMs, group chat, and activity
// chat, rather than duplicating the same markup and animation three times.
// `label` is optional: a DM has only one other person, so a plain bubble
// is unambiguous; group/activity chat can have several people typing at
// once, so those pass a label naming who it is.
export default function TypingBubble({ label }: { label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 14, marginTop: 4 }}>
      {label && <div style={{ fontSize: 11, color: COLORS.textFaint, marginBottom: 3, marginLeft: 4 }}>{label}</div>}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '12px 16px', borderRadius: 18,
        background: COLORS.violet, boxShadow: SHADOW.card
      }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="ts-typing-dot"
            style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block' }}
          />
        ))}
      </div>
    </div>
  );
}
