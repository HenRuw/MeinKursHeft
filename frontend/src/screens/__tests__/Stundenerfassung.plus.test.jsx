import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Stundenerfassung from '../Stundenerfassung.jsx';

// api is only touched on user actions (create/edit lessons), never on mount,
// so a bare render needs no network — but stub it defensively anyway.
vi.mock('../../api.js', () => ({ api: {} }));

function makeBundle(lessons = []) {
  return {
    course: { id: 1, name: 'Kurs' },
    quarters: [{ id: 1, idx: 0, label: 'Q1', start_date: '2026-01-01', end_date: '2026-12-31' }],
    lessons,
    students: [],
  };
}

const noop = () => {};

describe('Stundenerfassung "+" placement', () => {
  it('renders the "+" button before the tile row (as far left as possible)', () => {
    render(
      <Stundenerfassung
        bundle={makeBundle([])}
        onRefresh={noop}
        onOpenStudent={noop}
        presets={[]}
        onRefreshPresets={noop}
      />
    );

    const plus = screen.getByTitle('Neue Einheit');
    const hint = screen.getByText(/Noch keine Einheit/);

    // The "+" must come before the empty-state hint in document order, i.e.
    // it sits at the very left of the unit row instead of off to the right.
    const rel = plus.compareDocumentPosition(hint);
    expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('points the empty-state hint to the left', () => {
    render(
      <Stundenerfassung
        bundle={makeBundle([])}
        onRefresh={noop}
        onOpenStudent={noop}
        presets={[]}
        onRefreshPresets={noop}
      />
    );
    expect(screen.getByText(/links über/)).toBeInTheDocument();
  });
});
