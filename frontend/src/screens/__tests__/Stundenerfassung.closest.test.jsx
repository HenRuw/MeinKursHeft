import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Stundenerfassung from '../Stundenerfassung.jsx';
import { todayISO } from '../../lib/dates.js';

vi.mock('../../api.js', () => ({ api: {} }));

// Dates offset from the real "today" so the test doesn't depend on the wall
// clock — only on the relative distances between the units.
const today = todayISO();
const shift = (days) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const lesson = (id, date, topic) => ({
  id, quarter_id: 101, date, end_date: date, topic, note: '', content: '',
  duration_hours: 1, weight: 1, grades: [], attendance: [], remarks: [], grades_locked: 0,
});

function makeBundle(lessons) {
  return {
    course: { id: 1, name: 'K' },
    quarters: [{ id: 101, idx: 1, start_date: shift(-365), end_date: shift(365) }],
    students: [],
    lessons,
  };
}

function renderScreen(lessons) {
  return render(
    <Stundenerfassung
      bundle={makeBundle(lessons)}
      onRefresh={async () => {}}
      onOpenStudent={() => {}}
      presets={[]}
      onRefreshPresets={() => {}}
    />
  );
}

// A unit's topic renders once in its tile; the *selected* unit's topic also
// renders in the detail panel, so it shows up twice.
const isSelected = (topic) => screen.getAllByText(topic).length === 2;

describe('Stundenerfassung opens on the unit closest to today', () => {
  beforeEach(() => {
    // jsdom doesn't implement Element.scrollTo — used to centre the tile.
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HTMLElement.prototype.scrollTo;
  });

  it('selects the nearest unit even when none is exactly today', () => {
    renderScreen([
      lesson(1, shift(-40), 'Weit-in-der-Vergangenheit'),
      lesson(2, shift(-2), 'Fast-heute'),
      lesson(3, shift(30), 'Ferne-Zukunft'),
    ]);

    expect(isSelected('Fast-heute')).toBe(true);
    expect(isSelected('Weit-in-der-Vergangenheit')).toBe(false);
    expect(isSelected('Ferne-Zukunft')).toBe(false);
  });

  it('prefers a unit whose span contains today over a nearer-starting one', () => {
    const spanning = { ...lesson(2, shift(-3), 'Laeuft-gerade'), end_date: shift(3) };
    renderScreen([lesson(1, shift(1), 'Bald'), spanning]);

    // shift(1) starts only a day away, but the spanning unit contains today
    // (distance 0) and therefore wins.
    expect(isSelected('Laeuft-gerade')).toBe(true);
    expect(isSelected('Bald')).toBe(false);
  });

  it('centres the selected unit tile in the row on open', async () => {
    renderScreen([lesson(1, shift(-40), 'A'), lesson(2, shift(-1), 'B')]);
    await waitFor(() => expect(window.HTMLElement.prototype.scrollTo).toHaveBeenCalled());
  });
});
