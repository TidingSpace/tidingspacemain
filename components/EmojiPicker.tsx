'use client';

import { useState } from 'react';
import { COLORS, RADIUS, SHADOW } from '@/lib/designTokens';

// A curated, categorized set rather than a full Unicode emoji database —
// consistent with how reactions elsewhere in the app use a small fixed set
// rather than a general-purpose picker. This one's larger (composing a
// message benefits from more range than reacting to one does), but it's
// still a deliberately bounded, hand-picked list, not an external emoji
// library or dataset.
const EMOJI_CATEGORIES: { label: string; emoji: string[] }[] = [
  { label: 'Smileys', emoji: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '😘', '😋', '😜', '🤔', '😐', '😴', '🥳', '😭', '😡'] },
  { label: 'Gestures', emoji: ['👍', '👎', '👏', '🙌', '🙏', '👋', '🤝', '💪', '✌️', '🤞', '👌', '🤙', '👊', '✋'] },
  { label: 'Hearts', emoji: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💕', '💖', '💗', '💔'] },
  { label: 'Nature', emoji: ['🌟', '⭐', '🔥', '🌈', '☀️', '🌙', '⛄', '🌸', '🌻', '🍀', '🌊', '⚡'] },
  { label: 'Food', emoji: ['🍕', '🍔', '🍟', '🌮', '🍩', '☕', '🍺', '🍷', '🎂', '🍿'] },
  { label: 'Activities', emoji: ['🎉', '🎊', '🎈', '🏃', '🚴', '⚽', '🏀', '🎮', '📸', '✅'] }
];

export default function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [category, setCategory] = useState(0);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', bottom: 46, right: 0, width: 260,
        background: '#fff', borderRadius: RADIUS.md, boxShadow: SHADOW.raised,
        overflow: 'hidden', zIndex: 20
      }}
    >
      <div style={{ display: 'flex', overflowX: 'auto', borderBottom: `1px solid ${COLORS.border}`, padding: '8px 8px 0 8px', gap: 4 }}>
        {EMOJI_CATEGORIES.map((c, i) => (
          <button
            key={c.label}
            onClick={() => setCategory(i)}
            style={{
              flexShrink: 0, padding: '6px 10px', borderRadius: RADIUS.pill, border: 'none', cursor: 'pointer',
              fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
              background: category === i ? COLORS.violetTint : 'transparent',
              color: category === i ? COLORS.violetDeep : COLORS.textFaint
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2, padding: 10, maxHeight: 180, overflowY: 'auto' }}>
        {EMOJI_CATEGORIES[category].emoji.map((e) => (
          <button
            key={e}
            onClick={() => onSelect(e)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 6, borderRadius: RADIUS.sm, lineHeight: 1 }}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
