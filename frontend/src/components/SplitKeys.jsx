import { useEffect, useRef } from 'react';
import { GRADE_DIGITS, NB, num, gradeColor } from '../lib/gradeMath.js';

// The +/mid/− grade picker used everywhere a single grade is entered.
// Requirement: clicking + or − colors the middle field together with the
// active +/− zone in the grade's own color (gradient dark green -> yellow -> dark red).
// A "nicht bewertbar" checkbox sits beside the 1–6 columns to mark a slot as
// unassessable (see gradeMath's NB) — mutually exclusive with a digit.
export default function SplitKeys({ value, onChange, disabled, size, stackedNb }) {
  const s = size || { zone: 17, mid: 22, font: 14, zoneFont: 11.5 };
  const nbSelected = value === NB;
  // Remember the last real grade (anything that isn't the nb marker) so that
  // toggling nb off restores it instead of clearing the cell.
  const prevGradeRef = useRef(null);
  useEffect(() => {
    if (value !== NB) prevGradeRef.current = value;
  }, [value]);
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
      {/* "nicht bewertbar". Two layouts share the same toggle logic:
          - default (Notenübersicht): a single line, checkbox then label,
            kept from wrapping so the two words never break across lines.
          - stacked (Mitarbeit & Schriftliche Leistungen): three lines —
            "nicht", "bewertbar", then the checkbox — so the block is narrow
            and can hug the attendance/right edge of the row.
          Either way the block sizes to its content and wraps below the 1–6
          boxes as a whole where the row is too narrow. */}
      <label
        style={
          stackedNb
            ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 'none', fontSize: 11.5, lineHeight: 1.1, color: '#6c7a76', cursor: 'pointer', userSelect: 'none' }
            : { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, flex: 'none', fontSize: 11.5, lineHeight: 1.1, whiteSpace: 'nowrap', color: '#6c7a76', cursor: 'pointer', userSelect: 'none' }
        }
      >
        {stackedNb ? (
          <>
            <span>nicht</span>
            <span>bewertbar</span>
            <input
              type="checkbox"
              aria-label="nicht bewertbar"
              checked={nbSelected}
              onChange={() => onChange(nbSelected ? (prevGradeRef.current ?? null) : NB)}
              style={{ width: 15, height: 15, accentColor: '#6c7a76', cursor: 'pointer' }}
            />
          </>
        ) : (
          <>
            <input
              type="checkbox"
              aria-label="nicht bewertbar"
              checked={nbSelected}
              onChange={() => onChange(nbSelected ? (prevGradeRef.current ?? null) : NB)}
              style={{ width: 15, height: 15, accentColor: '#6c7a76', cursor: 'pointer' }}
            />
            <span>nicht bewertbar</span>
          </>
        )}
      </label>
    </span>
  );
}
