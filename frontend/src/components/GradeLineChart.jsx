import { useEffect, useRef, useState } from 'react';
import { gradeColor } from '../lib/gradeMath.js';

// Drawing happens in a fixed 960x250 viewBox that the SVG stretches to the
// container's width (height stays 1:1). Text labels are HTML overlays measured
// in real pixels, so we watch the container's actual width and use it to thin
// out and edge-clamp labels — that's what guarantees no label ever overlaps
// another, a point, the line, or the chart borders, at any width.
const CHARTW = 960;
const HEIGHT = 250;
const PAD_L = 40; // left inset: room for the y-axis numbers
const PAD_R = 22; // right inset: keeps the last point/label off the edge
const PAD_T = 20; // top inset: room for a grade label above the topmost point
const PAD_B = 34; // bottom inset: room for the date axis
const AXIS_B = HEIGHT - PAD_B; // baseline y
const PLOT_R = CHARTW - PAD_R; // right edge of the plotting area

function yFor(v) {
  return PAD_T + ((v - 1) / 5) * (AXIS_B - PAD_T);
}
function xFor(i, n) {
  if (n <= 1) return (PAD_L + PLOT_R) / 2;
  return PAD_L + (i * (PLOT_R - PAD_L)) / (n - 1);
}

// Greedy left-to-right pick that always keeps the first and last index and
// never lets two kept labels sit closer than minGap pixels — so a dense series
// simply shows fewer labels instead of overlapping ones.
function thin(n, minGap, pxAt) {
  if (n <= 1) return new Set([0]);
  const keep = [0];
  for (let i = 1; i < n; i += 1) {
    if (pxAt(i) - pxAt(keep[keep.length - 1]) >= minGap) keep.push(i);
  }
  const last = n - 1;
  if (keep[keep.length - 1] !== last) {
    while (keep.length > 1 && pxAt(last) - pxAt(keep[keep.length - 1]) < minGap) keep.pop();
    keep.push(last);
  }
  return new Set(keep);
}

// points: [{ date, label, value }] — value is the numeric grade (1-6), already de-nulled.
export default function GradeLineChart({ points, lineColor = '#0f5b52', emptyLabel }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!points.length) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#8b968f', fontSize: 12.5 }}>
        {emptyLabel || 'Keine Daten für diese Auswahl.'}
      </div>
    );
  }

  const n = points.length;
  const grid = [1, 2, 3, 4, 5, 6].map((v) => ({ v, y: yFor(v) }));
  const line = points.map((p, i) => `${xFor(i, n)},${yFor(p.value)}`).join(' ');

  // Real-pixel x of a point (0 until the container has been measured).
  const pxAt = (i) => (xFor(i, n) / CHARTW) * w;
  // Centered label clamped so it can't spill past either border.
  const clampCenter = (i, labelW) => Math.max(labelW / 2 + 2, Math.min(pxAt(i), w - labelW / 2 - 2));

  const ready = w > 0;
  const dateKeep = ready ? thin(n, 46, pxAt) : new Set();
  const gradeKeep = ready ? thin(n, 26, pxAt) : new Set();

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: 252 }}>
      <svg viewBox={`0 0 ${CHARTW} ${HEIGHT}`} preserveAspectRatio="none" style={{ width: '100%', height: HEIGHT, display: 'block' }}>
        {grid.map((g) => (
          <line key={g.v} x1={PAD_L} y1={g.y} x2={PLOT_R} y2={g.y} stroke="#ece8e0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={AXIS_B} stroke="#ddd7cb" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={PAD_L} y1={AXIS_B} x2={PLOT_R} y2={AXIS_B} stroke="#ddd7cb" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={line} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={xFor(i, n)} cy={yFor(p.value)} r="4.5" fill={gradeColor(p.value)} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {/* y-axis grade numbers, right-aligned just left of the axis line */}
      {grid.map((g) => (
        <span
          key={g.v}
          style={{ position: 'absolute', left: 0, width: 'calc(4.17% - 5px)', textAlign: 'right', top: g.y, transform: 'translateY(-50%)', font: "500 10px 'IBM Plex Mono',monospace", color: '#a6a096' }}
        >
          {g.v}
        </span>
      ))}

      {/* Grade labels, centered above their point, thinned + edge-clamped */}
      {ready &&
        points.map((p, i) =>
          gradeKeep.has(i) ? (
            <span
              key={`l${i}`}
              data-role="grade-label"
              style={{
                position: 'absolute',
                left: clampCenter(i, `${p.label}`.length * 7 + 6),
                top: Math.max(1, yFor(p.value) - 15),
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                font: "600 10.5px 'IBM Plex Sans',sans-serif",
                color: gradeColor(p.value),
              }}
            >
              {p.label}
            </span>
          ) : null
        )}

      {/* Date labels along the bottom axis, thinned + edge-clamped */}
      {ready &&
        points.map((p, i) =>
          dateKeep.has(i) ? (
            <span
              key={`d${i}`}
              data-role="date-label"
              style={{
                position: 'absolute',
                left: clampCenter(i, 44),
                top: AXIS_B + 7,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                font: "500 9.5px 'IBM Plex Mono',monospace",
                color: '#a6a096',
              }}
            >
              {p.date}
            </span>
          ) : null
        )}
    </div>
  );
}
