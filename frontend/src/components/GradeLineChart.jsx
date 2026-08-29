import { gradeColor } from '../lib/gradeMath.js';

const WIDTH = 960;
const HEIGHT = 250;
const PAD_L = 44;
const PAD_T = 14;
const PAD_B = 30;

function yFor(v) {
  return PAD_T + ((v - 1) / 5) * (HEIGHT - PAD_T - PAD_B);
}
function xFor(i, n) {
  if (n <= 1) return PAD_L + (WIDTH - PAD_L) / 2;
  return PAD_L + i * ((WIDTH - PAD_L) / (n - 1));
}

// points: [{ date, label, value }] — value is the numeric grade (1-6), already de-nulled.
export default function GradeLineChart({ points, lineColor = '#0f5b52', emptyLabel }) {
  if (!points.length) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#8b968f', fontSize: 12.5 }}>
        {emptyLabel || 'Keine Daten für diese Auswahl.'}
      </div>
    );
  }

  const grid = [1, 2, 3, 4, 5, 6].map((v) => ({ v, y: yFor(v) }));
  const line = points.map((p, i) => `${xFor(i, points.length)},${yFor(p.value)}`).join(' ');

  return (
    <div style={{ position: 'relative', width: '100%', height: 268 }}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" style={{ width: '100%', height: 250, display: 'block' }}>
        {grid.map((g) => (
          <line key={g.v} x1={40} y1={g.y} x2={WIDTH - 20} y2={g.y} stroke="#ece8e0" strokeWidth="1" />
        ))}
        <line x1={PAD_L} y1={14} x2={PAD_L} y2={222} stroke="#ddd7cb" strokeWidth="1" />
        <line x1={PAD_L} y1={222} x2={WIDTH - 20} y2={222} stroke="#ddd7cb" strokeWidth="1" />
        <polyline points={line} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={xFor(i, points.length)} cy={yFor(p.value)} r="4" fill={gradeColor(p.value)} />
        ))}
      </svg>
      {grid.map((g) => (
        <span key={g.v} style={{ position: 'absolute', left: 0, width: '3.6%', textAlign: 'right', top: g.y, transform: 'translateY(-50%)', font: "500 10px 'IBM Plex Mono',monospace", color: '#a6a096' }}>
          {g.v}
        </span>
      ))}
      {points.map((p, i) => (
        <span
          key={`d${i}`}
          style={{ position: 'absolute', left: `${(xFor(i, points.length) / WIDTH) * 100}%`, top: 230, transform: 'translateX(-50%)', whiteSpace: 'nowrap', font: "500 9.5px 'IBM Plex Mono',monospace", color: '#a6a096' }}
        >
          {p.date}
        </span>
      ))}
      {points.map((p, i) => (
        <span
          key={`l${i}`}
          style={{
            position: 'absolute',
            left: `calc(${(xFor(i, points.length) / WIDTH) * 100}% + 8px)`,
            top: yFor(p.value) - 10,
            transform: 'translateY(-50%)',
            whiteSpace: 'nowrap',
            font: "400 11px 'IBM Plex Sans',sans-serif",
            color: '#4b5c58',
          }}
        >
          {p.label}
        </span>
      ))}
      <span style={{ position: 'absolute', left: 0, top: -4, font: "500 9.5px 'IBM Plex Mono',monospace", color: '#8b968f', letterSpacing: '.09em' }}>NOTE</span>
      <span style={{ position: 'absolute', right: 0, bottom: 0, font: "500 9.5px 'IBM Plex Mono',monospace", color: '#8b968f', letterSpacing: '.09em' }}>DATUM</span>
    </div>
  );
}
