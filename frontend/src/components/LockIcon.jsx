// The lock toggle's glyph: a padlock emoji, open (🔓, shackle swung outward)
// when editing is allowed (open === true) and closed (🔒) when locked. The
// open state is desaturated and faded so it stays quiet — it's just the neutral
// "you may edit" affordance — while the locked state keeps its full colour and
// the button's gold chrome makes it prominent. data-state stays for tests.
export default function LockIcon({ open = false, size = 14 }) {
  return (
    <span
      data-state={open ? 'open' : 'closed'}
      aria-hidden="true"
      style={{
        fontSize: size,
        lineHeight: 1,
        display: 'block',
        filter: open ? 'grayscale(1)' : 'none',
        opacity: open ? 0.55 : 1,
      }}
    >
      {open ? '🔓' : '🔒'}
    </span>
  );
}
