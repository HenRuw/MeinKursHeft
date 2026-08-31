import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Notenuebersicht from '../Notenuebersicht.jsx';

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
        grades: [{ student_id: 1, grade: '2' }, { student_id: 2, grade: '3' }],
      },
    ],
    writtenWorks: [
      {
        id: 2001, quarter_id: 101, kind: 'klassenarbeit', title: '1. KA', content: '',
        date: '2026-09-20', weight: 2, grades_locked: 0,
        grades: [{ student_id: 1, grade: '2' }, { student_id: 2, grade: '3' }],
      },
    ],
    students: [
      { id: 1, first_name: 'Anna', last_name: 'Abel', klasse_name: '9a' },
      { id: 2, first_name: 'Bea', last_name: 'Boll', klasse_name: '9a' },
    ],
    gradeOverrides: [],
    averageLocks: [],
  };
}

const noop = () => {};

describe('Notenübersicht lock-row label', () => {
  it('labels the lock row "BEARBEITUNGSSPERRE" (not just "SPERRE")', () => {
    render(
      <Notenuebersicht
        bundle={makeBundle()}
        onRefresh={noop}
        onOpenStudent={noop}
        onOpenLesson={noop}
        onOpenWork={noop}
        allowGradeOverride={false}
      />
    );
    expect(screen.getByText('BEARBEITUNGSSPERRE')).toBeInTheDocument();
    expect(screen.queryByText('SPERRE')).toBeNull();
  });
});
