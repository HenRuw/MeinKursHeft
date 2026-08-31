import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Notenuebersicht, { defaultCollapsed } from '../Notenuebersicht.jsx';

vi.mock('../../api.js', () => ({ api: {} }));

function q(id, idx, half_id, start, end) {
  return { id, idx, half_id, weight_mitarbeit: 1, weight_schriftlich: 1, weight_quarter: 1, start_date: start, end_date: end };
}

function makeBundle() {
  return {
    course: { id: 1, name: 'Mathe' },
    halves: [
      { id: 10, idx: 1, weight: 1 },
      { id: 20, idx: 2, weight: 1 },
    ],
    quarters: [
      q(101, 1, 10, '2026-08-01', '2026-10-31'),
      q(102, 2, 10, '2026-11-01', '2027-01-31'),
      q(103, 3, 20, '2027-02-01', '2027-04-30'),
      q(104, 4, 20, '2027-05-01', '2027-07-31'),
    ],
    lessons: [
      {
        id: 1001, quarter_id: 101, date: '2026-09-01', topic: 'Einführung',
        duration_hours: 1, weight: 1, grades_locked: 0, attendance: [],
        grades: [{ student_id: 1, grade: '2' }],
      },
    ],
    writtenWorks: [],
    students: [{ id: 1, first_name: 'Anna', last_name: 'Abel', klasse_name: '9a' }],
    gradeOverrides: [],
    averageLocks: [],
  };
}

const noop = () => {};

function renderOverview() {
  return render(
    <Notenuebersicht
      bundle={makeBundle()}
      onRefresh={noop}
      onOpenStudent={noop}
      onOpenLesson={noop}
      onOpenWork={noop}
      allowGradeOverride={false}
    />
  );
}

describe('defaultCollapsed', () => {
  it('expands only the first Halbjahr and collapses the rest', () => {
    const halves = [
      { id: 10, idx: 1 },
      { id: 20, idx: 2 },
      { id: 30, idx: 3 },
    ];
    expect(defaultCollapsed(halves)).toEqual({
      year: false,
      half: { 20: true, 30: true },
      quarter: {},
      mit: {},
      schr: {},
    });
  });

  it('collapses nothing when there is only a first Halbjahr', () => {
    expect(defaultCollapsed([{ id: 10, idx: 1 }]).half).toEqual({});
  });
});

describe('Notenübersicht collapse state', () => {
  beforeEach(() => localStorage.clear());

  it('starts with only the 1. Halbjahr expanded (its quarters shown, the 2. HJ collapsed)', () => {
    renderOverview();
    // 1. Halbjahr expanded -> its quarter frames and its own label show.
    expect(screen.getByText('1. HALBJAHR')).toBeInTheDocument();
    expect(screen.getByText('1. QUARTAL')).toBeInTheDocument();
    expect(screen.getByText('2. QUARTAL')).toBeInTheDocument();
    // 2. Halbjahr collapsed -> its quarter frames are hidden, and its frame
    // shrinks to just the Halbjahresnote column.
    expect(screen.queryByText('3. QUARTAL')).toBeNull();
    expect(screen.queryByText('4. QUARTAL')).toBeNull();
    expect(screen.getByText('2.HJ-Note')).toBeInTheDocument();
  });

  it('restores a persisted state instead of the default', () => {
    // Simulate a user who previously expanded everything.
    localStorage.setItem(
      'notenuebersicht:1:collapsed',
      JSON.stringify({ year: false, half: {}, quarter: {}, mit: {}, schr: {} })
    );
    renderOverview();
    // The 2. Halbjahr's quarters are now shown, proving the stored state wins.
    expect(screen.getByText('3. QUARTAL')).toBeInTheDocument();
    expect(screen.getByText('4. QUARTAL')).toBeInTheDocument();
  });
});
