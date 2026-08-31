import { describe, expect, test, beforeEach } from 'vitest';
import { triggerShake } from '../shake.js';

describe('triggerShake', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('button');
    document.body.appendChild(el);
  });

  test('adds the lock-shake class to the element', () => {
    triggerShake(el);
    expect(el.classList.contains('lock-shake')).toBe(true);
  });

  test('clears the class again once the animation ends', () => {
    triggerShake(el);
    el.dispatchEvent(new Event('animationend'));
    expect(el.classList.contains('lock-shake')).toBe(false);
  });

  test('is a safe no-op when given no element', () => {
    expect(() => triggerShake(null)).not.toThrow();
    expect(() => triggerShake(undefined)).not.toThrow();
  });
});
