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
    // A new course opens on the view step -> Anlegen is visible right away.
    expect(screen.getByText('Anlegen')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Abbrechen'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('returns to the view step (not cancel) when leaving the add-students step', () => {
    const onCancel = vi.fn();
    render(<KursEditor {...props({ onCancel })} />);
    fireEvent.click(screen.getByText('+ Schüler hinzufügen'));
    // Now in add mode; its Abbrechen goes back to view.
    fireEvent.click(screen.getByText('Abbrechen'));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByText('Anlegen')).toBeInTheDocument();
  });
});
