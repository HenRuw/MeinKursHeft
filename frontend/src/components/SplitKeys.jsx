import { GRADE_DIGITS, NB, num, gradeColor } from '../lib/gradeMath.js';

// The +/mid/− grade picker used everywhere a single grade is entered.
// Requirement: clicking + or − colors the middle field together with the
// active +/− zone in the grade's own color (gradient dark green -> yellow -> dark red).
// A "nicht bewertbar" checkbox sits beside the 1–6 columns to mark a slot as
// unassessable (see gradeMath's NB) — mutually exclusive with a digit.
export default function SplitKeys({ value, onChange, disabled, size }) {
  const s = size || { zone: 17, mid: 22, font: 14, zoneFont: 11.5 };
  const nbSelected = value === NB;
  const digit = nbSelected ? null : value ? value[0] : null;
  const tendency = value && value[1] ? value[1] : '';

  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <span style={{ display: 'flex', gap: 6, alignItems: 'stretch', flex: 1, minWidth: 150 }}>
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
      {/* "nicht bewertbar" stacked on two lines with the checkbox below, in a
          fixed-width column so the 1–6 grade boxes beside it keep their full
          original width (the grid grade column is widened by this block's
          width + gap to match). */}
      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 'none', width: 62, fontSize: 11.5, lineHeight: 1.1, textAlign: 'center', color: '#6c7a76', cursor: 'pointer', userSelect: 'none' }}>
        <span>nicht</span>
        <span>bewertbar</span>
        <input
          type="checkbox"
          aria-label="nicht bewertbar"
          checked={nbSelected}
          onChange={() => onChange(nbSelected ? null : NB)}
          style={{ width: 15, height: 15, accentColor: '#6c7a76', cursor: 'pointer' }}
        />
      </label>
    </span>
  );
}
