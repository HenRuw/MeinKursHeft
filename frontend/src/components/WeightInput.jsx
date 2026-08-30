import { colors } from '../theme.js';

// Plain bordered text input, sized to comfortably fit a value like "0,5".
export default function WeightInput({ value, onChange, title }) {
  return (
    <input
      value={value}
      onChange={onChange}
      title={title || 'Gewicht'}
      style={{
        display: 'block',
        width: 34,
        height: 14,
        margin: '4px auto 0',
        padding: '0 3px',
        border: `1px solid ${colors.border}`,
        borderRadius: 5,
        background: colors.cream,
        textAlign: 'center',
        font: "500 10px 'IBM Plex Mono', monospace",
        color: colors.mutedStrong,
      }}
    />
  );
}
