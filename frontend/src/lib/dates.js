const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function formatShortDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return { dow: DOW[d.getDay()], label: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.` };
}

export function formatLongDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return `${DOW[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function formatDateRange(startIso, endIso) {
  const s = new Date(`${startIso}T00:00:00`);
  const e = new Date(`${endIso}T00:00:00`);
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
  return `${fmt(s)}–${fmt(e)}`;
}

// Picks the quarter whose date range contains today, falling back to the
// first quarter (by idx) if none matches or the list is empty-safe.
export function currentQuarter(quarters) {
  if (!quarters.length) return null;
  const today = todayISO();
  return quarters.find((q) => today >= q.start_date && today <= q.end_date) || [...quarters].sort((a, b) => a.idx - b.idx)[0];
}

export function quarterLabel(quarter) {
  return `Q${quarter.idx}`;
}
