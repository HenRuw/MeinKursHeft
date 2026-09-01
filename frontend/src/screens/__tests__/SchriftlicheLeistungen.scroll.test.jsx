import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import SchriftlicheLeistungen from '../SchriftlicheLeistungen.jsx';

vi.mock('../../api.js', () => ({ api: {} }));

// One written work so the roster (right-hand) pane renders; without a work the
// pane only shows the "noch keine …" placeholder and no scroller.
function makeBundle() {
  return {
    course: { id: 1, name: 'Mathe' },
    quarters: [{ id: 101, idx: 1, start_date: '2026-08-01', end_date: '2026-10-31' }],
    writtenWorks: [
      { id: 5, kind: 'klassenarbeit', title: '1. KA', content: '', date: '2026-09-01', weight: 1, grades: [], remarks: [], grades_locked: 0 },
    ],
    students: [{ id: 1, first_name: 'A', last_name: 'B' }],
  };
}

describe('SchriftlicheLeistungen roster stays scrollable when stacked', () => {
  // On a narrow screen the outer flex switches to a column (list on top,
  // roster below). The roster scroller only constrains its height — and so
  // only scrolls — if its containing <section> carries minHeight:0; otherwise
  // the default min-height:auto lets it grow to fit every student instead.
  it('gives the roster section minHeight:0 so overflow:auto can take effect', () => {
    const { container } = render(
      <SchriftlicheLeistungen bundle={makeBundle()} onRefresh={async () => {}} onOpenStudent={() => {}} presets={[]} onRefreshPresets={() => {}} />
    );

    // The sidebar list is also a .scroll-panel but is a <section>; the roster
    // scroller is a <div>, so this selects it unambiguously.
    const scroller = container.querySelector('div.scroll-panel');
    // Walk up to the flex section that must be height-constrained.
    let section = scroller.parentElement;
    while (section && section.tagName !== 'SECTION') section = section.parentElement;

    expect(section).not.toBeNull();
    expect(section.style.minHeight).toBe('0');
  });

  // Regression: the sticky name column must paint an opaque backing across the
  // 14px grid gap on its right, otherwise the grade cells scrolling sideways
  // show through the gap next to the pinned name.
  it('backs the 14px gap right of the sticky name so grades cannot show through', () => {
    const { container } = render(
      <SchriftlicheLeistungen bundle={makeBundle()} onRefresh={async () => {}} onOpenStudent={() => {}} presets={[]} onRefreshPresets={() => {}} />
    );

    // The pinned name cell is the sticky element offset to clear the "#" column.
    const name = [...container.querySelectorAll('*')].find(
      (el) => el.style.position === 'sticky' && el.style.left === '46px'
    );
    expect(name).toBeTruthy();
    // A rightward box-shadow (14px …) fills the gap up to the first grade column.
    expect(name.style.boxShadow).toContain('14px 0 0 0');
  });

  // Regression: the row is taller than the name (the note carries the stacked
  // "nicht bewertbar"), so the pinned name must stretch to the full row height —
  // otherwise a centered name leaves top/bottom strips through which the
  // sideways-scrolling grade cells show.
  it('stretches the pinned name to the full row height', () => {
    const { container } = render(
      <SchriftlicheLeistungen bundle={makeBundle()} onRefresh={async () => {}} onOpenStudent={() => {}} presets={[]} onRefreshPresets={() => {}} />
    );
    const name = [...container.querySelectorAll('*')].find(
      (el) => el.style.position === 'sticky' && el.style.left === '46px'
    );
    expect(name).toBeTruthy();
    expect(name.style.alignSelf).toBe('stretch');
  });
});
