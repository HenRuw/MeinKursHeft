// The little boxed collapse control shared by every list/table that folds a
// section away: a + when collapsed, and when open the `openGlyph` (a
// left-pointing ◀ by default, or e.g. a ▾ where "open" should read as
// down). `dark` flips it to the light-on-translucent variant used on a dark
// bar (the Notenübersicht year frame).
//
// With an `onClick` it renders as its own <button> (for callers whose
// surrounding header isn't itself clickable, e.g. the Notenübersicht frame
// headers). Without one it renders as a plain <span> so it can sit inside an
// enclosing <button> that already owns the toggle (e.g. the Schriftliche
// Leistungen category headers) without nesting a button in a button.
export default function CollapseArrow({ collapsed, onClick, dark, openGlyph = '◀' }) {
  const style = {
    flex: 'none',
    display: 'inline-block',
    width: 14,
    height: 14,
    borderRadius: 4,
    fontSize: 8,
    lineHeight: '14px',
    textAlign: 'center',
    color: dark ? '#fff' : '#3c4a46',
    background: dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.08)',
  };
  const title = collapsed ? 'Aufklappen' : 'Einklappen';
  const glyph = collapsed ? '+' : openGlyph;
  if (!onClick) {
    return (
      <span style={style} title={title}>
        {glyph}
      </span>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      style={style}
    >
      {glyph}
    </button>
  );
}
