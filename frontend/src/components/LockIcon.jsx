// The lock toggle's glyph: a pencil when editing is allowed (open === true)
// and a struck-through pencil when locked. Drawn as inline SVG with
// currentColor so the surrounding button's `color` tints it, and so the two
// states stay clearly distinct on every OS/browser (unlike emoji).
export default function LockIcon({ open = false, size = 14 }) {
  return (
    <svg
      data-state={open ? 'open' : 'closed'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      {!open && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}
