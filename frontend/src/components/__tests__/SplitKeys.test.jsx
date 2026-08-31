import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SplitKeys from '../SplitKeys.jsx';
import { gradeColor, num } from '../../lib/gradeMath.js';

describe('SplitKeys', () => {
  test('clicking a digit selects that plain grade', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SplitKeys value={null} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: '3', exact: true }));
    expect(onChange).toHaveBeenCalledWith('3');
  });

  test('clicking the same selected digit again clears it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SplitKeys value="3" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: '3', exact: true }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test('clicking the "+" zone above digit 2 sets "2+"', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SplitKeys value={null} onChange={onChange} />);

    const plusButtons = screen.getAllByRole('button', { name: '+', exact: true });
    // digits render in order 1..6, so index 1 corresponds to digit "2"
    await user.click(plusButtons[1]);
    expect(onChange).toHaveBeenCalledWith('2+');
  });

  test('clicking the active "+" zone again clears the tendency (falls back to null)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SplitKeys value="2+" onChange={onChange} />);

    const plusButtons = screen.getAllByRole('button', { name: '+', exact: true });
    await user.click(plusButtons[1]);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test('clicking "-" on a different digit switches to that digit with a minus tendency', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SplitKeys value="2+" onChange={onChange} />);

    const minusButtons = screen.getAllByRole('button', { name: '−', exact: true });
    await user.click(minusButtons[3]); // digit "4"
    expect(onChange).toHaveBeenCalledWith('4-');
  });

  test('the middle cell and the active tendency zone render in the same grade color (regression: colors must match)', () => {
    render(<SplitKeys value="2+" onChange={() => {}} />);
    const mid = screen.getByRole('button', { name: '2', exact: true });
    const plusButtons = screen.getAllByRole('button', { name: '+', exact: true });
    const activePlus = plusButtons[1];

    const expected = gradeColor(num('2+'));
    expect(mid).toHaveStyle({ backgroundColor: expected });
    expect(activePlus).toHaveStyle({ backgroundColor: expected });
  });

  test('an inactive tendency zone is not colored', () => {
    render(<SplitKeys value="2+" onChange={() => {}} />);
    const minusButtons = screen.getAllByRole('button', { name: '−', exact: true });
    // digit "2"'s own minus zone, not active since tendency is "+"
    expect(minusButtons[1]).toHaveStyle({ backgroundColor: '#f2efe8' });
  });

  test('checking "nicht bewertbar" selects the Nicht-bewertbar marker', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SplitKeys value={null} onChange={onChange} />);

    const box = screen.getByRole('checkbox', { name: /nicht bewertbar/i });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(onChange).toHaveBeenCalledWith('nb');
  });

  test('unchecking "nicht bewertbar" clears it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SplitKeys value="nb" onChange={onChange} />);

    const box = screen.getByRole('checkbox', { name: /nicht bewertbar/i });
    expect(box).toBeChecked();
    await user.click(box);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test('unchecking "nicht bewertbar" restores the grade entered before it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<SplitKeys value="2+" onChange={onChange} />);
    // Parent flips to the nb marker (as it would after checking the box)…
    rerender(<SplitKeys value="nb" onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: /nicht bewertbar/i });
    await user.click(box);
    expect(onChange).toHaveBeenCalledWith('2+');
  });

  test('with "nicht bewertbar" checked no digit reads as selected', () => {
    render(<SplitKeys value="nb" onChange={() => {}} />);
    // digit "1"'s middle cell keeps its unselected white background
    expect(screen.getByRole('button', { name: '1', exact: true })).toHaveStyle({ backgroundColor: '#fff' });
  });

  test('disabled prop dims the control and disables pointer events', () => {
    const { container } = render(<SplitKeys value={null} onChange={() => {}} disabled />);
    expect(container.firstChild).toHaveStyle({ opacity: 0.4, pointerEvents: 'none' });
  });
});
