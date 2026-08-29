import { describe, expect, test } from 'vitest';
import { generateOccurrenceDates, quarterForDate, MAX_OCCURRENCES } from '../recurrence.js';

describe('generateOccurrenceDates - weekly', () => {
  test('with no weekdays picked, repeats on the same weekday as the start date', () => {
    // 2026-09-07 is a Monday
    const dates = generateOccurrenceDates({ startDate: '2026-09-07', interval: 1, freq: 'w', weekdays: [], endMode: 'count', endCount: 3 });
    expect(dates).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
  });

  test('with explicit weekdays, emits all of them in chronological order within each week', () => {
    const dates = generateOccurrenceDates({
      startDate: '2026-09-07',
      interval: 1,
      freq: 'w',
      weekdays: ['Fr', 'Mo', 'Mi'], // intentionally out of order
      endMode: 'count',
      endCount: 6,
    });
    expect(dates).toEqual(['2026-09-07', '2026-09-09', '2026-09-11', '2026-09-14', '2026-09-16', '2026-09-18']);
  });

  test('respects an interval > 1 (every N weeks)', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-09-07', interval: 2, freq: 'w', weekdays: ['Mo'], endMode: 'count', endCount: 3 });
    expect(dates).toEqual(['2026-09-07', '2026-09-21', '2026-10-05']);
  });

  test('stops at (and includes) the end date', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-09-07', interval: 1, freq: 'w', weekdays: ['Mo'], endMode: 'date', endDate: '2026-09-21' });
    expect(dates).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
  });

  test('never includes an occurrence before the start date, even if the weekday matches earlier in that week', () => {
    // start on a Wednesday but weekday selection includes Monday of the same week
    const dates = generateOccurrenceDates({ startDate: '2026-09-09', interval: 1, freq: 'w', weekdays: ['Mo', 'Mi'], endMode: 'count', endCount: 3 });
    expect(dates).toEqual(['2026-09-09', '2026-09-14', '2026-09-16']);
  });
});

describe('generateOccurrenceDates - daily', () => {
  test('respects the interval', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-09-07', interval: 3, freq: 't', endMode: 'count', endCount: 4 });
    expect(dates).toEqual(['2026-09-07', '2026-09-10', '2026-09-13', '2026-09-16']);
  });
});

describe('generateOccurrenceDates - monthly', () => {
  test('clamps to the last day of shorter months instead of overflowing (Jan 31 -> Feb 28 -> Mar 31)', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-31', interval: 1, freq: 'm', endMode: 'count', endCount: 3 });
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  test('respects an interval > 1 (every N months)', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-09-15', interval: 2, freq: 'm', endMode: 'count', endCount: 3 });
    expect(dates).toEqual(['2026-09-15', '2026-11-15', '2027-01-15']);
  });
});

describe('generateOccurrenceDates - safety cap', () => {
  test('an unbounded ("never") series stops at MAX_OCCURRENCES instead of hanging', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', interval: 1, freq: 't', endMode: 'never' });
    expect(dates).toHaveLength(MAX_OCCURRENCES);
  });

  test('a requested count above the cap is clamped', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', interval: 1, freq: 't', endMode: 'count', endCount: 10000 });
    expect(dates).toHaveLength(MAX_OCCURRENCES);
  });
});

describe('quarterForDate', () => {
  const quarters = [
    { id: 1, start_date: '2026-08-01', end_date: '2026-11-15' },
    { id: 2, start_date: '2026-11-16', end_date: '2027-01-31' },
  ];

  test('finds the quarter containing the date', () => {
    expect(quarterForDate(quarters, '2026-09-07').id).toBe(1);
    expect(quarterForDate(quarters, '2026-12-01').id).toBe(2);
  });

  test('returns null when the date falls outside every quarter', () => {
    expect(quarterForDate(quarters, '2027-06-01')).toBeNull();
  });

  test('boundaries are inclusive', () => {
    expect(quarterForDate(quarters, '2026-11-15').id).toBe(1);
    expect(quarterForDate(quarters, '2026-11-16').id).toBe(2);
  });
});
