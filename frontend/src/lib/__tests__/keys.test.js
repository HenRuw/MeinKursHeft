import { describe, it, expect, vi } from 'vitest';
import { submitOnEnter } from '../keys.js';

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
