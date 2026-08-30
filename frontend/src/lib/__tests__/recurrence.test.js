import { describe, expect, test } from 'vitest';
import { quarterForDate } from '../recurrence.js';

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
