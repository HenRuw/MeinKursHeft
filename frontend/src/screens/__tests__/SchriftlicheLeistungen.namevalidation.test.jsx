import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SchriftlicheLeistungen from '../SchriftlicheLeistungen.jsx';

const createWrittenWork = vi.fn(async () => ({ id: 999 }));
vi.mock('../../api.js', () => ({ api: { createWrittenWork: (...a) => createWrittenWork(...a) } }));

function makeBundle() {
  return {
    course: { id: 1, name: 'Mathe' },
    quarters: [{ id: 101, idx: 1, start_date: '2026-08-01', end_date: '2026-10-31' }],
    writtenWorks: [],
    students: [],
  };
}

function openAddForm() {
  render(
    <SchriftlicheLeistungen bundle={makeBundle()} onRefresh={async () => {}} onOpenStudent={() => {}} presets={[]} onRefreshPresets={() => {}} />
  );
  fireEvent.click(screen.getByText('+ Neue Schriftliche Leistung'));
}

describe('SchriftlicheLeistungen name validation', () => {
  beforeEach(() => createWrittenWork.mockClear());

  it('blocks creation, blinks the field and shows a hint when no name is given', () => {
    openAddForm();
    fireEvent.click(screen.getByText('Anlegen'));

    expect(createWrittenWork).not.toHaveBeenCalled();
    expect(screen.getByText('Kein Name eingetragen')).toBeInTheDocument();
    const input = screen.getByPlaceholderText('z. B. 2. Klassenarbeit');
    expect(input.classList.contains('field-flash')).toBe(true);
  });

  it('clears the hint once a name is typed', () => {
    openAddForm();
    fireEvent.click(screen.getByText('Anlegen'));
    expect(screen.getByText('Kein Name eingetragen')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('z. B. 2. Klassenarbeit'), { target: { value: '2. Klassenarbeit' } });
    expect(screen.queryByText('Kein Name eingetragen')).toBeNull();
  });
});
