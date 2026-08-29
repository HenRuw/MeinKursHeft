import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RemarkPicker from '../RemarkPicker.jsx';

const presets = [{ id: 1, emoji: '📕', text: 'Material vergessen' }];

function setup(overrides = {}) {
  const props = {
    remarks: [],
    presets,
    onAddPreset: vi.fn(),
    onAddCustom: vi.fn(),
    onUpdateRemark: vi.fn(),
    onDeleteRemark: vi.fn(),
    ...overrides,
  };
  const utils = render(<RemarkPicker {...props} />);
  return { ...utils, props };
}

describe('RemarkPicker', () => {
  test('opens the preset menu when the trigger is clicked', async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.queryByText('BEMERKUNG AUSWÄHLEN')).not.toBeInTheDocument();
    await user.click(screen.getByTitle('Bemerkung hinzufügen'));
    expect(screen.getByText('BEMERKUNG AUSWÄHLEN')).toBeInTheDocument();
    expect(screen.getByText('Material vergessen')).toBeInTheDocument();
  });

  test('picking a preset calls onAddPreset with that preset', async () => {
    const user = userEvent.setup();
    const { props } = setup();

    await user.click(screen.getByTitle('Bemerkung hinzufügen'));
    await user.click(screen.getByText('Material vergessen'));

    expect(props.onAddPreset).toHaveBeenCalledWith(presets[0]);
  });

  test('adding a custom remark calls onAddCustom with the typed text and remember flag', async () => {
    const user = userEvent.setup();
    const { props } = setup();

    await user.click(screen.getByTitle('Bemerkung hinzufügen'));
    await user.click(screen.getByText('Neue Bemerkung'));
    await user.type(screen.getByPlaceholderText('Beschreibung …'), 'Sehr gute Mitarbeit');
    await user.click(screen.getByText('Hinzufügen'));

    expect(props.onAddCustom).toHaveBeenCalledWith({ emoji: '', text: 'Sehr gute Mitarbeit' }, true);
  });

  test('the "Hinzufügen" button stays disabled (no-op) until text is entered', async () => {
    const user = userEvent.setup();
    const { props } = setup();

    await user.click(screen.getByTitle('Bemerkung hinzufügen'));
    await user.click(screen.getByText('Neue Bemerkung'));
    await user.click(screen.getByText('Hinzufügen'));

    expect(props.onAddCustom).not.toHaveBeenCalled();
  });

  test('unchecking "merken" passes remember=false', async () => {
    const user = userEvent.setup();
    const { props } = setup();

    await user.click(screen.getByTitle('Bemerkung hinzufügen'));
    await user.click(screen.getByText('Neue Bemerkung'));
    await user.type(screen.getByPlaceholderText('Beschreibung …'), 'Testeintrag');
    await user.click(screen.getByRole('button', { name: '✓', exact: true }));
    await user.click(screen.getByText('Hinzufügen'));

    expect(props.onAddCustom).toHaveBeenCalledWith({ emoji: '', text: 'Testeintrag' }, false);
  });

  test('clicking an existing remark pill opens the edit popover with its text prefilled', async () => {
    const user = userEvent.setup();
    setup({ remarks: [{ id: 5, emoji: '', text: 'Hausaufgaben fehlen' }] });

    await user.click(screen.getByText('Hausaufgaben fehlen'));
    expect(screen.getByText('BEMERKUNG BEARBEITEN')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hausaufgaben fehlen')).toBeInTheDocument();
  });

  test('editing and saving calls onUpdateRemark with the new text', async () => {
    const user = userEvent.setup();
    const { props } = setup({ remarks: [{ id: 5, emoji: '', text: 'Hausaufgaben fehlen' }] });

    await user.click(screen.getByText('Hausaufgaben fehlen'));
    const input = screen.getByDisplayValue('Hausaufgaben fehlen');
    await user.clear(input);
    await user.type(input, 'Buch vergessen');
    await user.click(screen.getByText('Fertig'));

    expect(props.onUpdateRemark).toHaveBeenCalledWith(5, { emoji: '', text: 'Buch vergessen' });
  });

  test('deleting from the edit popover calls onDeleteRemark with the remark id', async () => {
    const user = userEvent.setup();
    const { props } = setup({ remarks: [{ id: 5, emoji: '', text: 'Hausaufgaben fehlen' }] });

    await user.click(screen.getByText('Hausaufgaben fehlen'));
    await user.click(screen.getByText('Löschen'));

    expect(props.onDeleteRemark).toHaveBeenCalledWith(5);
  });
});
