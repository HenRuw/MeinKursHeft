import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Stundenerfassung from '../Stundenerfassung.jsx';

// The unit the mocked backend "creates" and that onRefresh then surfaces.
const CREATED = {
  id: 999, quarter_id: 101, date: '2026-09-15', end_date: '2026-09-15',
  topic: '', note: '', content: '', duration_hours: 1, weight: 1,
  grades: [], attendance: [], remarks: [], grades_locked: 0,
};

vi.mock('../../api.js', () => ({
  api: { createLesson: vi.fn(async () => CREATED) },
}));

function makeBundle(lessons) {
  return {
    course: { id: 1, name: 'K' },
    quarters: [{ id: 101, idx: 1, half_id: 10, weight_mitarbeit: 1, weight_schriftlich: 1, weight_quarter: 1, start_date: '2026-08-01', end_date: '2026-10-31' }],
    students: [],
    lessons,
  };
}

// Mimics App: onRefresh re-fetches and the new unit appears in the bundle.
function Harness() {
  const [lessons, setLessons] = useState([]);
  const onRefresh = async () => setLessons([CREATED]);
  return (
    <Stundenerfassung
      bundle={makeBundle(lessons)}
      onRefresh={onRefresh}
      onOpenStudent={() => {}}
      presets={[]}
      onRefreshPresets={() => {}}
    />
  );
}

describe('Stundenerfassung scrolls a new unit into view', () => {
  beforeEach(() => {
    // jsdom doesn't implement Element.scrollTo.
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HTMLElement.prototype.scrollTo;
  });

  it('scrolls the tile row once the created unit has rendered', async () => {
    render(<Harness />);

    // Open the add popover and create the unit.
    fireEvent.click(screen.getByTitle('Neue Einheit'));
    const dateInput = document.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-09-15' } });
    fireEvent.click(screen.getByText('Stunde anlegen'));

    // The row was scrolled to bring the freshly created tile into view.
    await waitFor(() => expect(window.HTMLElement.prototype.scrollTo).toHaveBeenCalled());
  });

  // Regression: the pinned header cells need an opaque backing (gap shadow +
  // full-height stretch), or the sideways-scrolling column labels show through
  // behind "SCHÜLER:IN".
  it('backs the pinned header cells so the scrolling labels do not show through', () => {
    const { container } = render(
      <Stundenerfassung bundle={makeBundle([CREATED])} onRefresh={async () => {}} onOpenStudent={() => {}} presets={[]} onRefreshPresets={() => {}} />
    );
    const head = [...container.querySelectorAll('*')].find(
      (el) => el.style.position === 'sticky' && el.style.left === '46px' && el.textContent === 'SCHÜLER:IN'
    );
    expect(head).toBeTruthy();
    expect(head.style.boxShadow).toContain('14px 0 0 0');
    expect(head.style.alignSelf).toBe('stretch');
  });
});
