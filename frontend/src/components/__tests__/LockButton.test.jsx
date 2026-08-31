import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LockButton from '../LockButton.jsx';

describe('LockButton', () => {
  test('defaults to the open shackle when no locked prop is given', () => {
    render(<LockButton onClick={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent('🔓');
  });

  test('shows the closed shackle when locked', () => {
    render(<LockButton locked onClick={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent('🔒');
  });

  test('is always clickable and fires onClick (open state)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<LockButton onClick={onClick} />);
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('stays clickable while locked, so it can be unlocked again', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<LockButton locked onClick={onClick} />);
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
