import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Stundenerfassung from '../Stundenerfassung.jsx';

vi.mock('../../api.js', () => ({ api: {} }));

function makeBundle() {
  return {
    course: { id: 1, name: 'K' },
    quarters: [{ id: 101, idx: 1, half_id: 10, weight_mitarbeit: 1, weight_schriftlich: 1, weight_quarter: 1, start_date: '2026-08-01', end_date: '2026-10-31' }],
    students: [],
    lessons: [],
  };
}

function openAddForm() {
  render(
    <Stundenerfassung
      bundle={makeBundle()}
      onRefresh={() => {}}
      onOpenStudent={() => {}}
      presets={[]}
      onRefreshPresets={() => {}}
    />
  );
  fireEvent.click(screen.getByTitle('Neue Einheit'));
}

describe('Stundenerfassung add button pluralization', () => {
  it('reads "Stunde anlegen" for a single Schulstunde', () => {
    openAddForm();
    expect(screen.getByText('Stunde anlegen')).toBeInTheDocument();
  });

  it('reads "Stunden anlegen" once the length is more than one', () => {
    openAddForm();
    // The "Länge" stepper: [−, value, +] -> click + to reach 2 Schulstunden.
    const laengeRow = screen.getByText('Länge').parentElement;
    const stepButtons = laengeRow.querySelectorAll('button');
    fireEvent.click(stepButtons[stepButtons.length - 1]);

    expect(screen.getByText('Stunden anlegen')).toBeInTheDocument();
    expect(screen.queryByText('Stunde anlegen')).toBeNull();
  });
});
