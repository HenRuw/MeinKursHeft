import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Schueleransicht from '../Schueleransicht.jsx';

vi.mock('../../api.js', () => ({ api: {} }));

function q(id, idx, half_id) {
  return { id, idx, half_id, weight_mitarbeit: 1, weight_schriftlich: 1, weight_quarter: 1, start_date: '2026-08-01', end_date: '2027-07-31' };
}

// One student, all data lives in the 1st quarter: Ø Mitarbeit = mean(2,4) = 3,
// Ø Schriftlich (one Klassenarbeit "2") = 2, Q-Note = 2,5. One absence
// (unexcused) and one Verspätung. Lesson 1 carries a remark for the student.
function makeBundle() {
  return {
    course: { id: 1, name: 'Mathe' },
    halves: [
      { id: 10, idx: 1, weight: 1 },
      { id: 20, idx: 2, weight: 1 },
    ],
    quarters: [q(101, 1, 10), q(102, 2, 10), q(103, 3, 20), q(104, 4, 20)],
    lessons: [
      { id: 1, quarter_id: 101, date: '2026-09-01', topic: 'Einführung', weight: 1, grades_locked: 0, grades: [{ student_id: 1, grade: '2' }], attendance: [], remarks: [{ id: 1, student_id: 1, emoji: '⭐', text: 'stark mitgearbeitet' }] },
      { id: 2, quarter_id: 101, date: '2026-09-08', topic: 'Bruchrechnung', weight: 1, grades_locked: 0, grades: [{ student_id: 1, grade: '4' }], attendance: [], remarks: [] },
      { id: 3, quarter_id: 101, date: '2026-09-15', topic: 'Fehltag', weight: 1, grades_locked: 0, grades: [], attendance: [{ student_id: 1, status: 'fehlt', excused: 0 }], remarks: [] },
      { id: 4, quarter_id: 101, date: '2026-09-22', topic: 'Verspätung', weight: 1, grades_locked: 0, grades: [], attendance: [{ student_id: 1, status: 'verspaetet', late_minutes: 5 }], remarks: [] },
    ],
    writtenWorks: [
      { id: 5, quarter_id: 101, kind: 'klassenarbeit', date: '2026-09-10', title: 'KA 1', content: 'Kapitel 1', weight: 1, grades_locked: 0, grades: [{ student_id: 1, grade: '2' }] },
    ],
    students: [{ id: 1, first_name: 'Anna', last_name: 'Abel', klasse_name: '9a' }],
    gradeOverrides: [],
    averageLocks: [],
  };
}

const noop = () => {};

function renderView() {
  return render(
    <Schueleransicht bundle={makeBundle()} studentId={1} onRefresh={noop} onBack={noop} onOpenLesson={noop} onOpenWork={noop} />
  );
}

describe('Schüleransicht overview', () => {
  it('shows the Kennzahlen strip with the grade and attendance headlines', () => {
    renderView();
    // The grade labels appear both in the KPI strip and the overview rows.
    expect(screen.getAllByText('Ø MITARBEIT').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Ø SCHRIFTLICH').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('ZEUGNIS').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('VERSPÄTUNGEN')).toBeTruthy();
    expect(screen.getByText('FEHLSTUNDEN')).toBeTruthy();
    // One unexcused absence is called out in the Fehlstunden note.
    expect(screen.getByText('1 unentschuldigt')).toBeTruthy();
  });

  it('renders the compact per-student grade overview with rolled-up values', () => {
    renderView();
    expect(screen.getByText('NOTENÜBERSICHT')).toBeTruthy();
    // Ø Mitarbeit 3,0 · Ø Schriftlich 2,0 · Q-Note 2,5 for the 1st quarter —
    // shown in both the overview grid and (as the current quarter) the KPIs.
    expect(screen.getAllByText('3,0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2,5').length).toBeGreaterThan(0);
    // Empty quarters render an en dash rather than a value.
    expect(screen.getAllByText('–').length).toBeGreaterThan(0);
  });

  it("marks the lesson chart's graded point that has a remark", () => {
    renderView();
    const markers = screen.getAllByText('💬');
    expect(markers.length).toBe(1);
    expect(markers[0].getAttribute('title')).toContain('stark mitgearbeitet');
  });

  it('keeps the full detailed matrix collapsed by default', () => {
    renderView();
    expect(screen.getByText('AUSFÜHRLICHE NOTENÜBERSICHT')).toBeTruthy();
    // A matrix-only label proves its body is not mounted while collapsed.
    expect(screen.queryByText('BEARBEITUNGSSPERRE')).toBeNull();
  });
});
