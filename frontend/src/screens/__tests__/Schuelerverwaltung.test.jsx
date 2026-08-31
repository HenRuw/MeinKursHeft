import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Schuelerverwaltung from '../Schuelerverwaltung.jsx';

const deleteStudent = vi.fn(async () => {});
vi.mock('../../api.js', () => ({ api: { deleteStudent: (...a) => deleteStudent(...a) } }));

const students = [
  { id: 1, first_name: 'Anna', last_name: 'Abel', klasse_id: 10, klasse_name: '9a' },
  { id: 2, first_name: 'Bea', last_name: 'Boll', klasse_id: 10, klasse_name: '9a' },
  { id: 3, first_name: 'Cem', last_name: 'Cetin', klasse_id: 20, klasse_name: '9b' },
];
const klassen = [{ id: 10, name: '9a' }, { id: 20, name: '9b' }];

function renderIt(onRefresh = () => {}) {
  render(<Schuelerverwaltung allStudents={students} onRefreshAllStudents={onRefresh} klassen={klassen} onRefreshKlassen={() => {}} />);
}

describe('Schülerverwaltung select / filter / delete', () => {
  beforeEach(() => deleteStudent.mockClear());

  it('deletes exactly the selected students via the top delete button', async () => {
    const onRefresh = vi.fn();
    renderIt(onRefresh);

    fireEvent.click(screen.getByLabelText('Abel, Anna auswählen'));
    fireEvent.click(screen.getByLabelText('Cetin, Cem auswählen'));

    fireEvent.click(screen.getByText('2 löschen'));

    await waitFor(() => expect(deleteStudent).toHaveBeenCalledTimes(2));
    expect(deleteStudent).toHaveBeenCalledWith(1);
    expect(deleteStudent).toHaveBeenCalledWith(3);
    expect(deleteStudent).not.toHaveBeenCalledWith(2);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('the delete button is disabled with nothing selected', () => {
    renderIt();
    expect(screen.getByText('Löschen').closest('button')).toBeDisabled();
  });

  it('select-all ticks every visible student', () => {
    renderIt();
    fireEvent.click(screen.getByLabelText('Alle auswählen'));
    expect(screen.getByText('3 löschen')).toBeInTheDocument();
  });

  it('filtering by Klasse narrows the list and select-all only touches the filtered rows', () => {
    renderIt();
    // Filter to 9b (klasse id 20) -> only Cem remains.
    fireEvent.change(screen.getByDisplayValue('Alle Klassen'), { target: { value: '20' } });
    expect(screen.queryByText('Abel, Anna')).toBeNull();
    expect(screen.getByText('Cetin, Cem')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Alle auswählen'));
    expect(screen.getByText('1 löschen')).toBeInTheDocument();
  });
});
