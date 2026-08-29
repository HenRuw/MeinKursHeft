// A small numeric weight field styled after an old balance-scale weight
// (dome + ring loop on top, flat wider base) — replaces the plain
// rectangular weight box, and is deliberately compact.
export default function WeightInput({ value, onChange, title }) {
  return (
    <span
      style={{
        position: 'relative',
        display: 'block',
        width: 26,
        height: 28,
        margin: '4px auto 0',
      }}
      title={title || 'Gewicht'}
    >
      <svg width="26" height="28" viewBox="0 0 26 28" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <circle cx="13" cy="4" r="2.4" fill="none" stroke="#b6ab97" strokeWidth="1.5" />
        <path
          d="M9 8 H17 L22 24 Q22 26.5 19.3 26.5 H6.7 Q4 26.5 4 24 Z"
          fill="#fff"
          stroke="#b6ab97"
          strokeWidth="1.3"
        />
      </svg>
      <input
        value={value}
        onChange={onChange}
        style={{
          position: 'absolute',
          left: 4,
          right: 4,
          bottom: 3,
          height: 13,
          border: 'none',
          background: 'transparent',
          textAlign: 'center',
          font: "600 9.5px 'IBM Plex Mono',monospace",
          color: '#16211f',
          padding: 0,
        }}
      />
    </span>
  );
}
