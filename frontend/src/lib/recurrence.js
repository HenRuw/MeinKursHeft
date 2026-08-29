// Pure date-math for recurring lessons ("Wiederkehrender Termin"), modeled
// after Google Calendar's recurrence options: every N days/weeks/months, on
// selected weekdays (for weekly), ending never/on a date/after a count.

export const DAY_ORDER = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const JS_DAY_TO_LABEL = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']; // Date#getDay(): 0 = Sunday

// Hard safety cap so "never ends" (or a huge count) can't hang the browser.
export const MAX_OCCURRENCES = 366;

function parseISO(iso) {
  return new Date(`${iso}T00:00:00`);
}

function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const day = date.getDate();
  const d = new Date(date);
  d.setDate(1); // avoid overflow (e.g. Jan 31 + 1 month landing in March)
  d.setMonth(d.getMonth() + months);
  const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, daysInTargetMonth));
  return d;
}

// rule: { startDate, interval, freq: 'w'|'t'|'m', weekdays: string[],
//         endMode: 'never'|'date'|'count', endDate, endCount }
// Returns an array of ISO date strings ("YYYY-MM-DD"), including startDate.
export function generateOccurrenceDates(rule) {
  const interval = Math.max(1, rule.interval || 1);
  const start = parseISO(rule.startDate);
  const endDate = rule.endMode === 'date' && rule.endDate ? parseISO(rule.endDate) : null;
  const hardCap = rule.endMode === 'count' ? Math.min(Math.max(1, rule.endCount || 1), MAX_OCCURRENCES) : MAX_OCCURRENCES;

  const dates = [];

  if (rule.freq === 'w') {
    // No days picked -> repeat on the same weekday as the start date.
    const weekdays = rule.weekdays && rule.weekdays.length ? rule.weekdays : [JS_DAY_TO_LABEL[start.getDay()]];
    const dayOffsets = [...new Set(weekdays.map((label) => DAY_ORDER.indexOf(label)))]
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    const startDow = start.getDay() === 0 ? 6 : start.getDay() - 1; // Monday-based offset
    const firstWeekMonday = addDays(start, -startDow);

    weekLoop: for (let weekIndex = 0; weekIndex < MAX_OCCURRENCES; weekIndex += 1) {
      const weekMonday = addDays(firstWeekMonday, weekIndex * interval * 7);
      for (const offset of dayOffsets) {
        const d = addDays(weekMonday, offset);
        if (d < start) continue;
        if (endDate && d > endDate) break weekLoop;
        dates.push(d);
        if (dates.length >= hardCap) break weekLoop;
      }
    }
  } else if (rule.freq === 't') {
    for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
      const d = addDays(start, i * interval);
      if (endDate && d > endDate) break;
      dates.push(d);
      if (dates.length >= hardCap) break;
    }
  } else {
    for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
      const d = addMonths(start, i * interval);
      if (endDate && d > endDate) break;
      dates.push(d);
      if (dates.length >= hardCap) break;
    }
  }

  return dates.map(toLocalISO);
}

export function quarterForDate(quarters, iso) {
  return quarters.find((q) => iso >= q.start_date && iso <= q.end_date) || null;
}
