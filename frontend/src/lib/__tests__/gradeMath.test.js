import { describe, expect, test } from 'vitest';
import {
  num,
  fmt,
  gradeColor,
  gradeLabel,
  isNb,
  NB,
  wavg,
  averageLockedFor,
  averageColumnLocked,
  parseWeight,
  formatWeight,
  studentDisplayName,
  sortStudents,
  writtenWorkKindLabel,
  wrapLabel,
  GRADE_TYPE_SCALE,
  WRITTEN_WORK_KINDS,
} from '../gradeMath.js';

describe('num', () => {
  test('parses a plain digit grade', () => {
    expect(num('3')).toBe(3);
  });
  test('applies the "+" tendency as -0.3', () => {
    expect(num('2+')).toBeCloseTo(1.7);
  });
  test('applies the "-" tendency as +0.3', () => {
    expect(num('2-')).toBeCloseTo(2.3);
  });
  test('returns null for empty/falsy input', () => {
    expect(num(null)).toBeNull();
    expect(num('')).toBeNull();
    expect(num(undefined)).toBeNull();
  });
});

describe('n.b. (Nicht bewertbar)', () => {
  test('num maps the NB marker to null so it drops out of averages', () => {
    expect(num(NB)).toBeNull();
    expect(num('nb')).toBeNull();
  });
  test('isNb only matches the NB marker', () => {
    expect(isNb(NB)).toBe(true);
    expect(isNb('3')).toBe(false);
    expect(isNb(null)).toBe(false);
  });
  test('gradeLabel renders NB as "n.b." and leaves real grades alone', () => {
    expect(gradeLabel(NB)).toBe('n.b.');
    expect(gradeLabel('2+')).toBe('2+');
  });
  test('a NB entry is excluded from a weighted average, not counted as 0/6', () => {
    // one "2" and one "n.b." must average to exactly 2, not be dragged down.
    expect(wavg([[num('2'), 1], [num(NB), 1]])).toBe(2);
  });
});

describe('fmt', () => {
  test('formats with a German comma decimal', () => {
    expect(fmt(2.3)).toBe('2,3');
  });
  test('renders null as an en dash', () => {
    expect(fmt(null)).toBe('–');
  });
  test('renders NaN as an en dash', () => {
    expect(fmt(NaN)).toBe('–');
  });
  test('rounds to one decimal place', () => {
    expect(fmt(1.666)).toBe('1,7');
  });
});

describe('gradeColor', () => {
  test('returns the neutral gray for null', () => {
    expect(gradeColor(null)).toBe('#8b968f');
  });
  test('is dark green at the best grade (1)', () => {
    expect(gradeColor(1)).toBe('rgb(15, 107, 61)');
  });
  test('is gold/yellow at the middle grade (3)', () => {
    expect(gradeColor(3)).toBe('rgb(216, 160, 42)');
  });
  test('is dark red at the worst grade (6)', () => {
    expect(gradeColor(6)).toBe('rgb(139, 32, 32)');
  });
  test('clamps values outside the 1-6 range', () => {
    expect(gradeColor(0.5)).toBe(gradeColor(1));
    expect(gradeColor(9)).toBe(gradeColor(6));
  });
  test('interpolates linearly between stops (midpoint of green->gold)', () => {
    expect(gradeColor(2)).toBe('rgb(116, 134, 52)');
  });
  test('interpolates linearly between stops (midpoint of gold->red)', () => {
    expect(gradeColor(4.5)).toBe('rgb(178, 96, 37)');
  });
});

describe('wavg', () => {
  test('computes a weighted average', () => {
    expect(wavg([[2, 1], [4, 1]])).toBe(3);
    expect(wavg([[1, 3], [4, 1]])).toBeCloseTo(1.75);
  });
  test('skips null values', () => {
    expect(wavg([[null, 1], [2, 1]])).toBe(2);
  });
  test('skips non-positive weights', () => {
    expect(wavg([[2, 0], [4, 1]])).toBe(4);
    expect(wavg([[2, -1], [4, 1]])).toBe(4);
  });
  test('returns null when nothing is usable', () => {
    expect(wavg([])).toBeNull();
    expect(wavg([[null, 1]])).toBeNull();
    expect(wavg([[2, 0]])).toBeNull();
  });
});

describe('average locks (default open)', () => {
  const students = [{ id: 1 }, { id: 2 }];
  const lock = (studentId, kind, refId) => ({ student_id: studentId, kind, ref_id: refId });

  test('a cell with no lock row reads as unlocked', () => {
    expect(averageLockedFor([], 1, 'mitAvg', 7)).toBe(false);
    expect(averageLockedFor(undefined, 1, 'mitAvg', 7)).toBe(false);
  });
  test('a cell reads locked only for its own student/kind/refId', () => {
    const locks = [lock(1, 'mitAvg', 7)];
    expect(averageLockedFor(locks, 1, 'mitAvg', 7)).toBe(true);
    expect(averageLockedFor(locks, 2, 'mitAvg', 7)).toBe(false);
    expect(averageLockedFor(locks, 1, 'qNote', 7)).toBe(false);
  });
  test('a column defaults to open (no locks) and only locks when every student is locked', () => {
    expect(averageColumnLocked([], students, 'mitAvg', 7)).toBe(false);
    expect(averageColumnLocked([lock(1, 'mitAvg', 7)], students, 'mitAvg', 7)).toBe(false); // partial
    expect(averageColumnLocked([lock(1, 'mitAvg', 7), lock(2, 'mitAvg', 7)], students, 'mitAvg', 7)).toBe(true);
  });
  test('an empty roster reads as unlocked, never locked', () => {
    expect(averageColumnLocked([], [], 'mitAvg', 7)).toBe(false);
  });
});

describe('parseWeight', () => {
  test('parses a plain number', () => {
    expect(parseWeight('2')).toBe(2);
  });
  test('accepts a German comma decimal', () => {
    expect(parseWeight('1,5')).toBe(1.5);
  });
  test('rejects zero/negative/non-numeric as 0 (excluded from averages)', () => {
    expect(parseWeight('0')).toBe(0);
    expect(parseWeight('-1')).toBe(0);
    expect(parseWeight('abc')).toBe(0);
    expect(parseWeight('')).toBe(0);
  });
});

describe('formatWeight', () => {
  test('renders with a comma instead of a dot', () => {
    expect(formatWeight(1.5)).toBe('1,5');
  });
});

describe('studentDisplayName / sortStudents', () => {
  const students = [
    { id: 1, first_name: 'Ben', last_name: 'Weber' },
    { id: 2, first_name: 'Anna', last_name: 'Adler' },
    { id: 3, first_name: 'Ben', last_name: 'Adler' },
  ];

  test('formats as "Nachname, Vorname"', () => {
    expect(studentDisplayName(students[0])).toBe('Weber, Ben');
  });

  test('sorts by last name, then first name', () => {
    const sorted = sortStudents(students).map((s) => s.id);
    expect(sorted).toEqual([2, 3, 1]);
  });

  test('does not mutate the input array', () => {
    const copy = [...students];
    sortStudents(students);
    expect(students).toEqual(copy);
  });
});

describe('writtenWorkKindLabel / WRITTEN_WORK_KINDS', () => {
  test('has exactly the two required categories (Tests entfernt)', () => {
    expect(WRITTEN_WORK_KINDS.map((k) => k.value)).toEqual(['klassenarbeit', 'sonstige']);
  });
  test('maps kind values to German labels', () => {
    expect(writtenWorkKindLabel('klassenarbeit')).toBe('Klassenarbeit');
    expect(writtenWorkKindLabel('sonstige')).toBe('Sonstige Leistungen');
  });
  test('falls back to the raw value for an unknown kind', () => {
    expect(writtenWorkKindLabel('mystery')).toBe('mystery');
  });
});

describe('wrapLabel', () => {
  test('leaves short labels untouched', () => {
    expect(wrapLabel('Q-Note')).toBe('Q-Note');
  });
  test('inserts exactly one line break near the middle of a long label', () => {
    const wrapped = wrapLabel('1. Quartal · 01.08.–15.11.');
    expect(wrapped.split('\n')).toHaveLength(2);
  });
  test('breaks at a word boundary, not mid-word', () => {
    const wrapped = wrapLabel('Sonstige Schriftliche Leistung');
    const [first, second] = wrapped.split('\n');
    expect(first.endsWith(' ')).toBe(false);
    expect(second.startsWith(' ')).toBe(false);
  });
});

describe('GRADE_TYPE_SCALE', () => {
  test('single < average < summary in font size (the "2 size points" requirement)', () => {
    expect(GRADE_TYPE_SCALE.average.fontSize - GRADE_TYPE_SCALE.single.fontSize).toBe(2);
  });
  test('only summary is bold', () => {
    expect(GRADE_TYPE_SCALE.single.fontWeight).toBeLessThan(700);
    expect(GRADE_TYPE_SCALE.average.fontWeight).toBeLessThan(700);
    expect(GRADE_TYPE_SCALE.summary.fontWeight).toBe(700);
  });
});
