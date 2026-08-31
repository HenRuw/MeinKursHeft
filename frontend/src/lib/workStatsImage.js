import { num, isNb, gradeColor, fmt } from './gradeMath.js';
import { formatLongDate } from './dates.js';

// Renders a downloadable PNG for one written work: the course it belongs to,
// its name and date, the Durchschnitt and Median, and a bar chart of the grade
// distribution (bins by whole grade 1-6). n.b. and ungraded students are left
// out of the stats.
export function downloadWorkStatsImage(work, students, course) {
  const grades = students
    .map((s) => work.grades.find((g) => g.student_id === s.id)?.grade)
    .filter((g) => g && !isNb(g));
  const values = grades.map(num).filter((v) => v != null);
  const n = values.length;
  const avg = n ? values.reduce((a, b) => a + b, 0) / n : null;
  const median = (() => {
    if (!n) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  })();
  const counts = [1, 2, 3, 4, 5, 6].map((d) => values.filter((v) => Math.round(v) === d).length);
  const maxCount = Math.max(1, ...counts);

  const scale = 2;
  const W = 900;
  const H = 560;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const pad = 48;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Header, all in one uniform typeface for a tidy look: the work name as the
  // headline, then the course, then the date — each on its own line.
  const FONT = "Georgia, 'Times New Roman', serif";

  ctx.fillStyle = '#16211f';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(work.title || 'Schriftliche Leistung', pad, 56);

  let headerY = 84;
  if (course?.name) {
    ctx.fillStyle = '#6c7a76';
    ctx.font = `400 18px ${FONT}`;
    ctx.fillText(course.name, pad, headerY);
    headerY += 26;
  }

  ctx.fillStyle = '#8b968f';
  ctx.font = `400 16px ${FONT}`;
  ctx.fillText(formatLongDate(work.date), pad, headerY);

  ctx.fillStyle = '#16211f';
  ctx.font = `500 18px ${FONT}`;
  ctx.fillText(
    n ? `Durchschnitt: ${fmt(avg)}     Median: ${fmt(median)}     (${n} Bewertung${n === 1 ? '' : 'en'})` : 'Keine Bewertungen',
    pad,
    headerY + 34
  );

  const chartTop = 170;
  const chartBottom = H - 88;
  const chartLeft = pad + 40; // room for the y-axis title and tick labels
  const chartRight = W - pad;
  const chartH = chartBottom - chartTop;
  const chartW = chartRight - chartLeft;

  // Y-axis scale: whole-number ticks from 0 up to a rounded maximum so the
  // "Anzahl" axis stays readable no matter how many students there are.
  const step = Math.max(1, Math.ceil(maxCount / 5));
  const yMax = Math.max(step, Math.ceil(maxCount / step) * step);

  // Horizontal gridlines + y-axis tick labels (Anzahl der Bewertungen).
  ctx.textBaseline = 'middle';
  for (let t = 0; t <= yMax; t += step) {
    const y = chartBottom - (t / yMax) * chartH;
    if (t > 0) {
      ctx.strokeStyle = '#eef0ea';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y + 0.5);
      ctx.lineTo(chartRight, y + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#8b968f';
    ctx.font = '500 14px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(t), chartLeft - 10, y);
  }
  ctx.textBaseline = 'alphabetic';

  // Axes: solid y-axis (left) and x-axis (bottom).
  ctx.strokeStyle = '#b9c1bb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(chartLeft + 0.5, chartTop);
  ctx.lineTo(chartLeft + 0.5, chartBottom + 0.5);
  ctx.lineTo(chartRight, chartBottom + 0.5);
  ctx.stroke();

  const slot = chartW / 6;
  const barW = slot * 0.58;
  [1, 2, 3, 4, 5, 6].forEach((d, i) => {
    const c = counts[i];
    const x = chartLeft + i * slot + (slot - barW) / 2;
    const h = (c / yMax) * chartH;
    const y = chartBottom - h;
    if (c > 0) {
      ctx.fillStyle = gradeColor(d);
      ctx.fillRect(x, y, barW, h);
      ctx.fillStyle = '#16211f';
      ctx.font = '600 16px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(c), x + barW / 2, y - 8);
    }
    ctx.fillStyle = '#4b5c58';
    ctx.font = '600 19px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(d), x + barW / 2, chartBottom + 26);
  });

  // Axis titles ("Note" along x, "Anzahl" rotated along y).
  ctx.fillStyle = '#4b5c58';
  ctx.font = '600 15px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Note', chartLeft + chartW / 2, chartBottom + 54);

  ctx.save();
  ctx.translate(pad - 14, chartTop + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4b5c58';
  ctx.font = '600 15px Arial, sans-serif';
  ctx.fillText('Anzahl', 0, 0);
  ctx.restore();

  const slug = (work.title || 'klausur').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'klausur';
  const link = document.createElement('a');
  link.download = `notenverteilung-${slug}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  link.remove();
}
