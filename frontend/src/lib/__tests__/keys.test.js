import { describe, it, expect, vi } from 'vitest';
import { submitOnEnter, stepSelection } from '../keys.js';

describe('stepSelection', () => {
  const ids = [10, 20, 30];

  it('lands on the first row on the first ArrowDown when nothing is marked', () => {
    expect(stepSelection(ids, null, 'ArrowDown')).toBe(10);
  });

  it('lands on the last row on the first ArrowUp when nothing is marked', () => {
    expect(stepSelection(ids, null, 'ArrowUp')).toBe(30);
  });

  it('walks down one row per press', () => {
    expect(stepSelection(ids, 10, 'ArrowDown')).toBe(20);
    expect(stepSelection(ids, 20, 'ArrowDown')).toBe(30);
  });

  it('walks up one row per press', () => {
    expect(stepSelection(ids, 30, 'ArrowUp')).toBe(20);
  });

  it('clamps at the ends', () => {
    expect(stepSelection(ids, 30, 'ArrowDown')).toBe(30);
    expect(stepSelection(ids, 10, 'ArrowUp')).toBe(10);
  });

  it('returns the current selection for an empty list', () => {
    expect(stepSelection([], 5, 'ArrowDown')).toBe(5);
  });
});

const evt = (over) => ({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), ...over });

describe('submitOnEnter', () => {
  it('fires and prevents default on a plain Enter', () => {
    const handler = vi.fn();
    const e = evt();
    submitOnEnter(handler)(e);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('ignores Shift+Enter so a textarea can still insert a newline', () => {
    const handler = vi.fn();
    const e = evt({ shiftKey: true });
    submitOnEnter(handler)(e);
    expect(handler).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores non-Enter keys', () => {
    const handler = vi.fn();
    submitOnEnter(handler)(evt({ key: 'a' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores Enter mid IME composition', () => {
    const handler = vi.fn();
    submitOnEnter(handler)(evt({ nativeEvent: { isComposing: true } }));
    expect(handler).not.toHaveBeenCalled();
  });
});
