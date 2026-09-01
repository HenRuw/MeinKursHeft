import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KursEditor from '../KursEditor.jsx';

function props(overrides = {}) {
  return {
    mode: 'create',
    course: null,
    allStudents: [],
    klassen: [],
    initialSelectedIds: [],
    onSubmit: () => {},
    onDelete: () => {},
    onCancel: () => {},
    onManageStudents: () => {},
    ...overrides,
  };
}

// The empty-state hint lives in the add-students step, reached from the view
// step via "+ Schüler hinzufügen".
function openAddStep() {
  fireEvent.click(screen.getByText('+ Schüler hinzufügen'));
}

describe('KursEditor empty-system hint', () => {
  it('hints at the Schülerverwaltung when no students exist at all (create mode)', () => {
    render(<KursEditor {...props()} />);
    openAddStep();
    expect(screen.getByText(/Noch keine Schüler:innen im System/)).toBeInTheDocument();
    // and it is not the misleading "already in the course" message
    expect(screen.queryByText(/bereits im Kurs/)).toBeNull();
  });

  it('the hint links to the Schülerverwaltung', () => {
    const onManageStudents = vi.fn();
    render(<KursEditor {...props({ onManageStudents })} />);
    openAddStep();
    fireEvent.click(screen.getByText('Schüler:innen anlegen'));
    expect(onManageStudents).toHaveBeenCalledTimes(1);
  });

  it('still shows "alle bereits im Kurs" when students exist but are all enrolled', () => {
    render(
      <KursEditor
        {...props({
          allStudents: [{ id: 1, first_name: 'Anna', last_name: 'Abel', klasse_id: 1, klasse_name: '9a' }],
          initialSelectedIds: [1],
        })}
      />
    );
    openAddStep();
    expect(screen.getByText(/Alle Schüler:innen sind bereits im Kurs/)).toBeInTheDocument();
    expect(screen.queryByText(/Noch keine Schüler:innen im System/)).toBeNull();
  });
});
