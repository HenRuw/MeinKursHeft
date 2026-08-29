import { GRADE_DIGITS, num, gradeColor } from '../lib/gradeMath.js';

// The +/mid/− grade picker used everywhere a single grade is entered.
// Requirement: clicking + or − colors the middle field together with the
// active +/− zone in the grade's own color (gradient dark green -> yellow -> dark red).
export default function SplitKeys({ value, onChange, disabled, size }) {
  const s = size || { zone: 17, mid: 22, font: 14, zoneFont: 11.5 };
  const digit = value ? value[0] : null;
  const tendency = value && value[1] ? value[1] : '';

  return (
    <span style={{ display: 'flex', gap: 6, opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      {GRADE_DIGITS.map((g) => {
        const selected = digit === g;
        const color = selected ? gradeColor(num(g + tendency)) : null;
        const plusOn = selected && tendency === '+';
        const minusOn = selected && tendency === '-';
        const zoneStyle = (on) => ({
          height: s.zone,
          fontSize: s.zoneFont,
          fontWeight: 600,
          lineHeight: `${s.zone}px`,
          color: on ? '#fff' : '#9a958b',
          background: on ? color : '#f2efe8',
        });
        return (
          <span
            key={g}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              border: selected ? `1px solid ${color}` : '1px solid #e2ddd2',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#fff',
            }}
          >
            <button
              onClick={() => onChange(plusOn ? null : g + '+')}
              style={{ ...zoneStyle(plusOn), borderRadius: '7px 7px 0 0' }}
            >
              +
            </button>
            <button
              onClick={() => onChange(selected && !tendency ? null : g)}
              style={{
                height: s.mid,
                font: `600 ${s.font}px 'IBM Plex Mono',monospace`,
                background: selected ? color : '#fff',
                color: selected ? '#fff' : '#16211f',
              }}
            >
              {g}
            </button>
            <button
              onClick={() => onChange(minusOn ? null : g + '-')}
              style={{ ...zoneStyle(minusOn), borderRadius: '0 0 7px 7px' }}
            >
              −
            </button>
          </span>
        );
      })}
    </span>
  );
}
