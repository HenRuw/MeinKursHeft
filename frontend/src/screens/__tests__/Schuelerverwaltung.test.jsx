import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Schuelerverwaltung from '../Schuelerverwaltung.jsx';

const removeStudentFromYear = vi.fn(async () => {});
vi.mock('../../api.js', () => ({ api: { removeStudentFromYear: (...a) => removeStudentFromYear(...a) } }));

const YEAR = 2026;
// Year-scoped students carry class_id + klasse_name (class_id null = Ohne Klasse).
const students = [
  { id: 1, first_name: 'Anna', last_name: 'Abel', class_id: 10, klasse_name: '9a' },
  { id: 2, first_name: 'Bea', last_name: 'Boll', class_id: 10, klasse_name: '9a' },
  { id: 3, first_name: 'Cem', last_name: 'Cetin', class_id: 20, klasse_name: '9b' },
];
const klassen = [{ id: 10, name: '9a' }, { id: 20, name: '9b' }];

function renderIt(onRefresh = () => {}) {
  render(<Schuelerverwaltung yearId={YEAR} archived={false} allStudents={students} onRefreshAllStudents={onRefresh} klassen={klassen} onRefreshKlassen={() => {}} />);
}

describe('Schülerverwaltung select / filter / remove-from-year', () => {
  beforeEach(() => removeStudentFromYear.mockClear());

  it('removes exactly the selected students from the year via the top button', async () => {
    const onRefresh = vi.fn();
    renderIt(onRefresh);

    fireEvent.click(screen.getByLabelText('Abel, Anna auswählen'));
    fireEvent.click(screen.getByLabelText('Cetin, Cem auswählen'));

    fireEvent.click(screen.getByText('2 entfernen'));

    await waitFor(() => expect(removeStudentFromYear).toHaveBeenCalledTimes(2));
    expect(removeStudentFromYear).toHaveBeenCalledWith(1, YEAR);
    expect(removeStudentFromYear).toHaveBeenCalledWith(3, YEAR);
    expect(removeStudentFromYear).not.toHaveBeenCalledWith(2, YEAR);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('the remove button is disabled with nothing selected', () => {
    renderIt();
    expect(screen.getByText('Entfernen').closest('button')).toBeDisabled();
  });

  it('select-all ticks every visible student', () => {
    renderIt();
    fireEvent.click(screen.getByLabelText('Alle auswählen'));
    expect(screen.getByText('3 entfernen')).toBeInTheDocument();
  });

  it('filtering by Klasse narrows the list and select-all only touches the filtered rows', () => {
    renderIt();
    // Filter to 9b (class id 20) -> only Cem remains.
    fireEvent.change(screen.getByDisplayValue('Alle Klassen'), { target: { value: '20' } });
    expect(screen.queryByText('Abel, Anna')).toBeNull();
    expect(screen.getByText('Cetin, Cem')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Alle auswählen'));
    expect(screen.getByText('1 entfernen')).toBeInTheDocument();
  });
});
