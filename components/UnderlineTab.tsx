import { COLORS } from '@/lib/designTokens';

// Previously reimplemented separately in Feed, Saved, and Search — each had
// quietly drifted from the others (different font size, different inactive
// color) despite being the same visual component. One shared implementation
// now, so it can't diverge again. `fillWidth` covers Search's case (5 tabs
// need to share a row evenly); Feed/Saved's fewer, shorter tabs read better
// at natural width, so that's opt-in rather than forced on everyone.
export default function UnderlineTab({
  label,
  active,
  disabled,
  fillWidth,
  onClick
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  fillWidth?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: fillWidth ? 1 : undefined,
        background: 'none', border: 'none', padding: '4px 0', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
        fontSize: 15.5, fontWeight: active ? 700 : 500,
        color: disabled ? COLORS.textFaint : active ? COLORS.violet : COLORS.textSecondary,
        borderBottom: active ? `2.5px solid ${COLORS.violet}` : '2.5px solid transparent',
        opacity: disabled ? 0.5 : 1,
        transition: 'color 0.15s ease, border-color 0.15s ease'
      }}
    >
      {label}
    </button>
  );
}
