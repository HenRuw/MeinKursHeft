import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KursEditor from '../KursEditor.jsx';

function common(onManageStudents) {
  return {
    allStudents: [
      { id: 1, first_name: 'Anna', last_name: 'Abel', klasse_id: 1, klasse_name: '9a' },
      { id: 2, first_name: 'Bea', last_name: 'Boll', klasse_id: 1, klasse_name: '9a' },
    ],
    klassen: [{ id: 1, name: '9a' }],
    initialSelectedIds: [1],
    onSubmit: () => {},
    onDelete: () => {},
    onCancel: () => {},
    onManageStudents,
  };
}

describe('KursEditor "Schülerdaten verwalten" button', () => {
  it('is visible immediately in create mode (which opens in add-students)', () => {
    render(<KursEditor mode="create" course={null} {...common(() => {})} />);
    expect(screen.getByText('Schülerdaten verwalten')).toBeInTheDocument();
  });

  it('is visible in edit mode', () => {
    render(<KursEditor mode="edit" course={{ id: 1, name: 'K' }} {...common(() => {})} />);
    expect(screen.getByText('Schülerdaten verwalten')).toBeInTheDocument();
  });

  it('stays visible while removing students', () => {
    render(<KursEditor mode="edit" course={{ id: 1, name: 'K' }} {...common(() => {})} />);
    fireEvent.click(screen.getByText('− Schüler entfernen'));
    expect(screen.getByText('Schülerdaten verwalten')).toBeInTheDocument();
  });

  it('calls onManageStudents when clicked', () => {
    const onManage = vi.fn();
    render(<KursEditor mode="edit" course={{ id: 1, name: 'K' }} {...common(onManage)} />);
    fireEvent.click(screen.getByText('Schülerdaten verwalten'));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('is omitted entirely when no onManageStudents handler is provided', () => {
    render(<KursEditor mode="edit" course={{ id: 1, name: 'K' }} {...common(undefined)} />);
    expect(screen.queryByText('Schülerdaten verwalten')).toBeNull();
  });

  it('sits left-aligned directly next to Abbrechen (no auto margin)', () => {
    render(<KursEditor mode="edit" course={{ id: 1, name: 'K' }} {...common(() => {})} />);
    const manage = screen.getByText('Schülerdaten verwalten');
    expect(manage.style.marginLeft).not.toBe('auto');
    // It is the Abbrechen button's next sibling in the footer.
    const abbrechen = screen.getByText('Abbrechen');
    expect(abbrechen.nextElementSibling).toBe(manage);
  });
});
