import { describe, expect, test, beforeAll, afterAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import GradeLineChart from '../GradeLineChart.jsx';

const WIDTH = 520;

// jsdom does no layout, so force a concrete container width and a no-op
// ResizeObserver; the component reads clientWidth on mount.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
});
afterAll(() => {
  delete HTMLElement.prototype.clientWidth;
});

function densePoints(n) {
  return Array.from({ length: n }, (_, i) => ({
    date: `${String((i % 28) + 1).padStart(2, '0')}.09.`,
    label: i % 3 === 0 ? '2+' : '3-',
    value: 1 + (i % 6),
  }));
}

// The px extent a centered label occupies around its `left`.
function box(el, estWidth) {
  const left = parseFloat(el.style.left);
  return { l: left - estWidth / 2, r: left + estWidth / 2 };
}

function assertNoHorizontalOverlap(nodes, estWidth) {
  const boxes = [...nodes].map((el) => box(el, estWidth)).sort((a, b) => a.l - b.l);
  for (let i = 1; i < boxes.length; i += 1) {
    expect(boxes[i].l).toBeGreaterThanOrEqual(boxes[i - 1].r - 0.01);
  }
  for (const b of boxes) {
    expect(b.l).toBeGreaterThanOrEqual(-0.01);
    expect(b.r).toBeLessThanOrEqual(WIDTH + 0.01);
  }
}

describe('GradeLineChart label layout', () => {
  test.each([8, 20, 45, 120])('no overlapping/overflowing labels with %i points', (n) => {
    const { container } = render(<GradeLineChart points={densePoints(n)} />);
    assertNoHorizontalOverlap(container.querySelectorAll('[data-role="date-label"]'), 44);
    assertNoHorizontalOverlap(container.querySelectorAll('[data-role="grade-label"]'), 20);
    expect(container.querySelectorAll('[data-role="date-label"]').length).toBeGreaterThanOrEqual(2);
    cleanup();
  });

  test('renders the empty state without labels', () => {
    const { container, getByText } = render(<GradeLineChart points={[]} emptyLabel="leer" />);
    getByText('leer');
    expect(container.querySelectorAll('[data-role="date-label"]').length).toBe(0);
  });
});
