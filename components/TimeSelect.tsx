import { useEffect, useRef, useState } from 'react';
import { COLORS, RADIUS, SHADOW } from '@/lib/designTokens';

// One clock icon + the current time, click it to reveal a compact picker —
// not three dropdowns sitting open at once. The picker itself still uses
// native <select> elements underneath (hour/minute/AM-PM), since those are
// what actually solved the real cross-browser problem this component
// exists for: input type="time" renders wildly differently between
// browsers (Chrome shows a clickable widget, Firefox/Safari don't show one
// at all), so building a custom picker from selects — which render
// consistently everywhere — guarantees the same experience for everyone.
// This is purely a presentation change: same "HH:MM" 24-hour value in and
// out, just tucked behind one click instead of always visible.
export default function TimeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const [h24, m] = value ? value.split(':').map(Number) : [NaN, NaN];
  const hasValue = !isNaN(h24) && !isNaN(m);
  const hour12 = hasValue ? (h24 % 12 === 0 ? 12 : h24 % 12) : '';
  const minute = hasValue ? m : '';
  const period = hasValue ? (h24 >= 12 ? 'PM' : 'AM') : '';

  function commit(nextHour12: number | '', nextMinute: number | '', nextPeriod: 'AM' | 'PM' | '') {
    if (nextHour12 === '' || nextMinute === '' || nextPeriod === '') return; // wait until all three are chosen
    let h = nextHour12 % 12;
    if (nextPeriod === 'PM') h += 12;
    onChange(`${String(h).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`);
  }

  const displayText = hasValue
    ? `${hour12}:${String(minute).padStart(2, '0')} ${period}`
    : 'Set time';

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none',
          padding: 0, cursor: 'pointer', fontSize: 14, color: hasValue ? COLORS.ink : COLORS.textFaint
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        {displayText}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '130%', left: 0, zIndex: 30, background: '#fff', borderRadius: RADIUS.md,
          boxShadow: SHADOW.raised, border: `1px solid ${COLORS.border}`, padding: 12,
          display: 'flex', alignItems: 'center', gap: 4
        }}>
          <select
            value={hour12}
            onChange={(e) => commit(Number(e.target.value), minute === '' ? 0 : minute, period || 'AM')}
            style={selectStyle}
            aria-label="Hour"
          >
            <option value="" disabled>--</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <span style={{ color: COLORS.textFaint }}>:</span>
          <select
            value={minute === '' ? '' : String(minute).padStart(2, '0')}
            onChange={(e) => commit(hour12 || 12, Number(e.target.value), period || 'AM')}
            style={selectStyle}
            aria-label="Minute"
          >
            <option value="" disabled>--</option>
            {/* 5-minute increments for a fast, clean list — but the actual
                current value is always included even if it's not one of
                them, so a minute that isn't a multiple of 5 (possible from
                before this component existed) never silently loses precision. */}
            {Array.from(new Set([...Array.from({ length: 12 }, (_, i) => i * 5), ...(minute !== '' ? [minute] : [])]))
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={String(m).padStart(2, '0')}>{String(m).padStart(2, '0')}</option>
              ))}
          </select>
          <select
            value={period}
            onChange={(e) => commit(hour12 || 12, minute === '' ? 0 : minute, e.target.value as 'AM' | 'PM')}
            style={{ ...selectStyle, minWidth: 56 }}
            aria-label="AM or PM"
          >
            <option value="" disabled>--</option>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  border: 'none', outline: 'none', fontSize: 14, color: COLORS.ink, background: 'transparent',
  cursor: 'pointer', minWidth: 44
};
