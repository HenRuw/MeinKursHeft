import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KursEditor from '../KursEditor.jsx';

function props(overrides = {}) {
  return {
    mode: 'create',
    course: null,
    allStudents: [{ id: 1, first_name: 'Anna', last_name: 'Abel', klasse_id: 1, klasse_name: '9a' }],
    klassen: [{ id: 1, name: '9a' }],
    initialSelectedIds: [],
    onSubmit: () => {},
    onDelete: () => {},
    onCancel: () => {},
    onManageStudents: () => {},
    ...overrides,
  };
}

describe('KursEditor Abbrechen', () => {
  it('cancels the whole editor from the initial create screen', () => {
    const onCancel = vi.fn();
    render(<KursEditor {...props({ onCancel })} />);
    // A new course opens straight on the add-students step ("Weiter" carries on
    // to the view step); its Abbrechen closes the whole editor.
    expect(screen.getByText('Weiter')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Abbrechen'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('returns to the view step (not cancel) when leaving a later add-students step', () => {
    const onCancel = vi.fn();
    render(<KursEditor {...props({ onCancel })} />);
    // Step forward to the view step (nobody selected -> "Weiter"); "Anlegen" lives there.
    fireEvent.click(screen.getByText('Weiter'));
    expect(screen.getByText('Anlegen')).toBeInTheDocument();
    // Re-open the add step from the view; now its Abbrechen only steps back.
    fireEvent.click(screen.getByText('+ Schüler hinzufügen'));
    fireEvent.click(screen.getByText('Abbrechen'));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByText('Anlegen')).toBeInTheDocument();
  });
});
