import { colors } from '../theme.js';

// Small padlock toggle used to lock a single grade or a whole grade set
// (Notensatz) against editing. Locked cells render their SplitKeys disabled;
// this button stays enabled so the lock can be lifted again -- except when a
// governing set lock is active, in which case the per-grade buttons are shown
// locked but disabled (the set lock decides), via the `disabled` prop.
export default function LockButton({ locked, onClick, disabled, size = 22, title }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
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
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {locked ? '🔒' : '🔓'}
    </button>
  );
}
