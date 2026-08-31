import { GRADE_DIGITS, NB, num, gradeColor } from '../lib/gradeMath.js';

// The +/mid/− grade picker used everywhere a single grade is entered.
// Requirement: clicking + or − colors the middle field together with the
// active +/− zone in the grade's own color (gradient dark green -> yellow -> dark red).
// A separate "n.b." key sits after the 1–6 columns to mark a slot as
// "nicht bewertbar" (see gradeMath's NB) — mutually exclusive with a digit,
// toggled off by clicking it again.
export default function SplitKeys({ value, onChange, disabled, size }) {
  const s = size || { zone: 17, mid: 22, font: 14, zoneFont: 11.5 };
  const nbSelected = value === NB;
  const digit = nbSelected ? null : value ? value[0] : null;
  const tendency = value && value[1] ? value[1] : '';

  return (
    <span style={{ display: 'flex', gap: 6, alignItems: 'stretch', opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
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
      <button
        onClick={() => onChange(nbSelected ? null : NB)}
        title="Nicht bewertbar"
        style={{
          flex: 'none',
          width: 34,
          borderRadius: 8,
          border: `1px solid ${nbSelected ? '#6c7a76' : '#e2ddd2'}`,
          background: nbSelected ? '#6c7a76' : '#fff',
          color: nbSelected ? '#fff' : '#9a958b',
          font: `600 ${s.zoneFont}px 'IBM Plex Mono',monospace`,
        }}
      >
        n.b.
      </button>
    </span>
  );
}
