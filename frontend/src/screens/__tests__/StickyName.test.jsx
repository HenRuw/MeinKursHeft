import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Stundenerfassung from '../Stundenerfassung.jsx';
import SchriftlicheLeistungen from '../SchriftlicheLeistungen.jsx';

vi.mock('../../api.js', () => ({ api: {} }));

const student = { id: 1, first_name: 'Anna', last_name: 'Abel', klasse_name: '9a' };

function stundenBundle() {
  return {
    course: { id: 1, name: 'K' },
    quarters: [{ id: 101, idx: 1, half_id: 10, weight_mitarbeit: 1, weight_schriftlich: 1, weight_quarter: 1, start_date: '2026-08-01', end_date: '2026-10-31' }],
    lessons: [{ id: 1001, quarter_id: 101, date: '2026-08-31', end_date: '2026-08-31', topic: 'x', duration_hours: 1, weight: 1, grades_locked: 0, grades: [], attendance: [], remarks: [] }],
    students: [student],
  };
}

function kaBundle() {
  return {
    course: { id: 1, name: 'K' },
    quarters: [{ id: 101, idx: 1, start_date: '2026-08-01', end_date: '2026-10-31' }],
    writtenWorks: [{ id: 2001, quarter_id: 101, kind: 'klassenarbeit', title: 'KA1', content: '', date: '2026-09-01', weight: 1, grades_locked: 0, grades: [], remarks: [] }],
    students: [student],
  };
}

const noop = () => {};

// The pinned name column must sit above the sideways-scrolling grade cells
// (z-index) and paint an opaque backing, otherwise scrolled content shows
// through / over the student's name.
function expectPinned(nameEl) {
  const button = nameEl.closest('button');
  expect(button.style.position).toBe('sticky');
  expect(Number(button.style.zIndex)).toBeGreaterThan(0);
  expect(button.style.background).not.toBe('');
}

describe('Sticky name column does not let content bleed through', () => {
  it('Mitarbeit (Stundenerfassung): name cell is stacked and backed', () => {
    render(<Stundenerfassung bundle={stundenBundle()} onRefresh={noop} onOpenStudent={noop} presets={[]} onRefreshPresets={noop} />);
    expectPinned(screen.getByText('Abel, Anna'));
  });

  it('Schriftliche Leistungen: name cell is stacked and backed', () => {
    render(<SchriftlicheLeistungen bundle={kaBundle()} onRefresh={noop} onOpenStudent={noop} presets={[]} onRefreshPresets={noop} />);
    expectPinned(screen.getByText('Abel, Anna'));
  });
});
