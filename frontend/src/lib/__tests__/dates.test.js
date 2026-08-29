import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { todayISO, formatShortDate, formatLongDate, formatDateRange, currentQuarter, quarterLabel } from '../dates.js';

describe('formatShortDate', () => {
  test('formats an ISO date as German day-of-week + dd.mm.', () => {
    // 2026-09-07 is a Monday
    expect(formatShortDate('2026-09-07')).toEqual({ dow: 'Mo', label: '07.09.' });
  });
});

describe('formatLongDate', () => {
  test('formats an ISO date with weekday, date and year', () => {
    expect(formatLongDate('2026-09-07')).toBe('Mo, 07.09.2026');
  });
});

describe('formatDateRange', () => {
  test('formats a start/end pair as dd.mm.–dd.mm.', () => {
    expect(formatDateRange('2026-08-01', '2026-11-15')).toBe('01.08.–15.11.');
  });
});

describe('currentQuarter', () => {
  const quarters = [
    { id: 1, idx: 1, start_date: '2026-08-01', end_date: '2026-11-15' },
    { id: 2, idx: 2, start_date: '2026-11-16', end_date: '2027-01-31' },
    { id: 3, idx: 3, start_date: '2027-02-01', end_date: '2027-04-15' },
    { id: 4, idx: 4, start_date: '2027-04-16', end_date: '2027-07-31' },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('picks the quarter whose range contains today', () => {
    vi.setSystemTime(new Date('2026-12-01T12:00:00'));
    expect(currentQuarter(quarters).id).toBe(2);
  });

  test('falls back to the first quarter (by idx) when none match', () => {
    vi.setSystemTime(new Date('2030-01-01T12:00:00'));
    expect(currentQuarter(quarters).id).toBe(1);
  });

  test('returns null for an empty list', () => {
    expect(currentQuarter([])).toBeNull();
  });
});

describe('quarterLabel', () => {
  test('renders as "Q<idx>"', () => {
    expect(quarterLabel({ idx: 3 })).toBe('Q3');
  });
});

describe('todayISO', () => {
  test('returns a YYYY-MM-DD string', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
