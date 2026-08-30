import { useRef, useState } from 'react';
import { colors, fonts } from '../theme.js';
import { parseWeight, formatWeight } from '../lib/gradeMath.js';
import Popover from './Popover.jsx';

const STEP = 0.5;

// Trigger button looks exactly like the old plain input (same size/border),
// but opens a popover instead of being directly editable itself: +/- step
// the common case (nudging by 0.5) without ever touching a keyboard. The
// number in the middle starts as plain text, not an input -- a single tap
// inside the popover shouldn't already commit you to text entry -- and only
// a second, deliberate tap on the number swaps it into a real input and
// brings up the keyboard, for typing an exact value directly.
export default function WeightInput({ value, onChange, title }) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(formatWeight(value));

  const commit = (raw) => {
    const next = parseWeight(raw);
    if (next !== value) onChange(next);
  };

  const step = (delta) => {
    setEditing(false);
    commit(Math.max(0, Math.round((value + delta) * 2) / 2));
  };

  const startEditing = () => {
    setText(formatWeight(value));
    setEditing(true);
  };

  const finishEditing = () => {
    commit(text);
    setEditing(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(true)}
        title={title || 'Gewicht'}
        style={{
          display: 'block',
          width: 34,
          height: 14,
          margin: '4px auto 0',
          padding: '0 3px',
          border: `1px solid ${open ? colors.teal : colors.border}`,
          borderRadius: 5,
          background: colors.cream,
          textAlign: 'center',
          font: `500 10px ${fonts.mono}`,
          color: colors.mutedStrong,
        }}
      >
        {formatWeight(value)}
      </button>
      <Popover
        open={open}
        anchorRef={btnRef}
        onClose={() => {
          if (editing) finishEditing();
          setOpen(false);
        }}
        width={104}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 8,
            background: '#fff',
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,.18)',
          }}
        >
          <button
            onClick={() => step(-STEP)}
            title="0,5 abziehen"
            style={{ flex: 'none', width: 22, height: 22, borderRadius: 6, background: colors.tealTint, color: colors.teal, font: `700 14px ${fonts.mono}` }}
          >
            −
          </button>
          {editing ? (
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={finishEditing}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  finishEditing();
                  setOpen(false);
                } else if (e.key === 'Escape') {
                  setEditing(false);
                }
              }}
              inputMode="decimal"
              autoFocus
              style={{ flex: 1, minWidth: 0, textAlign: 'center', font: `600 13px ${fonts.mono}`, color: colors.ink, border: `1px solid ${colors.borderStrong}`, borderRadius: 6, padding: '2px 0' }}
            />
          ) : (
            <button
              onClick={startEditing}
              title="Genauen Wert eingeben"
              style={{ flex: 1, minWidth: 0, textAlign: 'center', font: `600 13px ${fonts.mono}`, color: colors.ink }}
            >
              {formatWeight(value)}
            </button>
          )}
          <button
            onClick={() => step(STEP)}
            title="0,5 addieren"
            style={{ flex: 'none', width: 22, height: 22, borderRadius: 6, background: colors.tealTint, color: colors.teal, font: `700 14px ${fonts.mono}` }}
          >
            +
          </button>
        </div>
      </Popover>
    </>
  );
}
