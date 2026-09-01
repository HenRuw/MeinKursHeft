// The lock toggle's glyph: a padlock emoji, open (🔓) when editing is allowed
// (open === true) and closed (🔒) when locked. The two emoji can look alike in
// some emoji fonts, but the surrounding LockButton also changes colour/border
// (gold + tinted background when locked), so the state is always clear. The
// data-state attribute stays for tests and styling.
export default function LockIcon({ open = false, size = 14 }) {
  return (
    <span
      data-state={open ? 'open' : 'closed'}
      aria-hidden="true"
      style={{ fontSize: size, lineHeight: 1, display: 'block' }}
    >
      {open ? '🔓' : '🔒'}
    </span>
  );
}
