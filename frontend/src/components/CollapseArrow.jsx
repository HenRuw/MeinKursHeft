// The little boxed collapse control shared by every list/table that folds a
// section away. The app-wide default matches the Schriftliche-Leistungen
// arrows: a right-pointing ▶ when collapsed and a down-pointing ▼ when open.
// Callers may override `collapsedGlyph`/`openGlyph` for special cases.
// `size`/`fontSize` scale the box and glyph. `dark` flips it to the
// light-on-translucent variant used on a dark bar (the Notenübersicht year
// frame).
//
// With an `onClick` it renders as its own <button> (for callers whose
// surrounding header isn't itself clickable, e.g. the Notenübersicht frame
// headers). Without one it renders as a plain <span> so it can sit inside an
// enclosing <button> that already owns the toggle (e.g. the Schriftliche
// Leistungen category headers) without nesting a button in a button.
export default function CollapseArrow({ collapsed, onClick, dark, openGlyph = '▼', collapsedGlyph = '▶', size = 14, fontSize = 8 }) {
  const style = {
    flex: 'none',
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: 4,
    fontSize,
    lineHeight: `${size}px`,
    textAlign: 'center',
    color: dark ? '#fff' : '#3c4a46',
    background: dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.08)',
  };
  const title = collapsed ? 'Aufklappen' : 'Einklappen';
  const glyph = collapsed ? collapsedGlyph : openGlyph;
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
