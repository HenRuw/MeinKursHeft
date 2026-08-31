import { num, isNb, gradeColor, fmt } from './gradeMath.js';
import { formatLongDate } from './dates.js';

// Renders a downloadable PNG for one written work: its name and date, the
// Durchschnitt and Median, and a bar chart of the grade distribution (bins by
// whole grade 1-6). n.b. and ungraded students are left out of the stats.
export function downloadWorkStatsImage(work, students) {
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

  ctx.fillStyle = '#16211f';
  ctx.font = "600 30px Georgia, 'Times New Roman', serif";
  ctx.fillText(work.title || 'Schriftliche Leistung', pad, 60);

  ctx.fillStyle = '#6c7a76';
  ctx.font = '400 17px Arial, sans-serif';
  ctx.fillText(formatLongDate(work.date), pad, 88);

  ctx.fillStyle = '#16211f';
  ctx.font = '500 18px Arial, sans-serif';
  ctx.fillText(
    n ? `Durchschnitt: ${fmt(avg)}     Median: ${fmt(median)}     (${n} Bewertung${n === 1 ? '' : 'en'})` : 'Keine Bewertungen',
    pad,
    122
  );

  const chartTop = 160;
  const chartBottom = H - 70;
  const chartLeft = pad;
  const chartRight = W - pad;
  const chartH = chartBottom - chartTop;
  const chartW = chartRight - chartLeft;

  ctx.strokeStyle = '#e2ddd2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(chartLeft, chartBottom + 0.5);
  ctx.lineTo(chartRight, chartBottom + 0.5);
  ctx.stroke();

  const slot = chartW / 6;
  const barW = slot * 0.58;
  [1, 2, 3, 4, 5, 6].forEach((d, i) => {
    const c = counts[i];
    const x = chartLeft + i * slot + (slot - barW) / 2;
    const h = (c / maxCount) * (chartH - 12);
    const y = chartBottom - h;
    if (c > 0) {
      ctx.fillStyle = gradeColor(d);
      ctx.fillRect(x, y, barW, h);
    }
    ctx.textAlign = 'center';
    if (c > 0) {
      ctx.fillStyle = '#16211f';
      ctx.font = '600 16px Arial, sans-serif';
      ctx.fillText(String(c), x + barW / 2, y - 8);
    }
    ctx.fillStyle = '#4b5c58';
    ctx.font = '600 19px Arial, sans-serif';
    ctx.fillText(String(d), x + barW / 2, chartBottom + 28);
  });

  ctx.textAlign = 'right';
  ctx.fillStyle = '#8b968f';
  ctx.font = '500 13px Arial, sans-serif';
  ctx.fillText('Note', chartRight, chartBottom + 52);

  const slug = (work.title || 'klausur').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'klausur';
  const link = document.createElement('a');
  link.download = `notenverteilung-${slug}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  link.remove();
}
