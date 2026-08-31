import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KursEditor from '../KursEditor.jsx';

function renderCreate(onSubmit) {
  render(
    <KursEditor
      mode="create"
      course={null}
      allStudents={[]}
      klassen={[]}
      initialSelectedIds={[]}
      onSubmit={onSubmit}
      onDelete={() => {}}
      onCancel={() => {}}
      onManageStudents={null}
    />
  );
  // A brand-new course opens in "add students" mode; leave it to reveal the
  // "Anlegen" button.
  fireEvent.click(screen.getByText('Abbrechen'));
}

describe('KursEditor name validation on "Anlegen"', () => {
  it('blocks submit, blinks the field and shows a hint when the name is empty', () => {
    const onSubmit = vi.fn();
    renderCreate(onSubmit);

    fireEvent.click(screen.getByText('Anlegen'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Kein Name eingetragen')).toBeInTheDocument();
    // The name field blinks via the field-flash animation class.
    const input = screen.getByRole('textbox');
    expect(input.classList.contains('field-flash')).toBe(true);
  });

  it('clears the hint once a name is typed and then submits', () => {
    const onSubmit = vi.fn();
    renderCreate(onSubmit);

    fireEvent.click(screen.getByText('Anlegen'));
    expect(screen.getByText('Kein Name eingetragen')).toBeInTheDocument();

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Mathe' } });
    expect(screen.queryByText('Kein Name eingetragen')).toBeNull();

    fireEvent.click(screen.getByText('Anlegen'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].name).toBe('Mathe');
  });

  it('treats a whitespace-only name as empty', () => {
    const onSubmit = vi.fn();
    renderCreate(onSubmit);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Anlegen'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Kein Name eingetragen')).toBeInTheDocument();
  });
});
