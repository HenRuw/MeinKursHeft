// An inline SVG padlock, drawn open or closed, so the two states are always
// visually distinct on every OS/browser -- unlike the 🔒/🔓 emojis, whose
// open variant renders identically to the closed one under some emoji fonts.
// Uses currentColor, so the surrounding button's `color` tints it.
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
      <rect x="3" y="11" width="18" height="11" rx="2" />
      {open ? <path d="M7 11V7a5 5 0 0 1 9.9-1" /> : <path d="M7 11V7a5 5 0 0 1 10 0v4" />}
    </svg>
  );
}
