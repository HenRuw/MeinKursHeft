import { colors } from '../theme.js';

// Small padlock toggle for locking a whole grade set (Notensatz) or an
// average column/cell against editing. It is always clickable -- so a lock
// can always be lifted again -- and defaults to the open shackle (🔓) when
// `locked` is falsy, switching to the closed shackle (🔒) when locked.
export default function LockButton({ locked = false, onClick, size = 22, title }) {
  return (
    <button
      onClick={onClick}
      title={title || (locked ? 'Bearbeitung entsperren' : 'Bearbeitung sperren')}
      style={{
        flex: 'none',
        width: size,
        height: size,
        borderRadius: 6,
        fontSize: size * 0.5,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${locked ? colors.gold : colors.borderCard}`,
        background: locked ? colors.goldBg : '#fff',
        color: locked ? colors.gold : colors.faint,
        cursor: 'pointer',
      }}
    >
      {locked ? '🔒' : '🔓'}
    </button>
  );
}
