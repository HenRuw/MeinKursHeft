import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Notenuebersicht, { splitKlassenarbeit } from '../Notenuebersicht.jsx';

vi.mock('../../api.js', () => ({ api: {} }));

const ZWSP = '​';

describe('splitKlassenarbeit', () => {
  it('inserts a zero-width break between Klassen and arbeiten (plural)', () => {
    expect(splitKlassenarbeit('Ø KLASSENARBEITEN')).toBe(`Ø KLASSEN${ZWSP}ARBEITEN`);
    expect(splitKlassenarbeit('KLASSENARBEITEN')).toBe(`KLASSEN${ZWSP}ARBEITEN`);
  });

  it('handles the singular "Klassenarbeit" too', () => {
    expect(splitKlassenarbeit('1. Klassenarbeit')).toBe(`1. Klassen${ZWSP}arbeit`);
  });

  it('leaves unrelated labels untouched', () => {
    expect(splitKlassenarbeit('2. QUARTAL')).toBe('2. QUARTAL');
    expect(splitKlassenarbeit('Ø SONSTIGE MITARBEIT')).toBe('Ø SONSTIGE MITARBEIT');
  });
});

function q(id, idx, half_id, start, end) {
  return { id, idx, half_id, weight_mitarbeit: 1, weight_schriftlich: 1, weight_quarter: 1, start_date: start, end_date: end };
}

function makeBundle() {
  return {
    course: { id: 1, name: 'Mathe' },
    halves: [{ id: 10, idx: 1, weight: 1 }, { id: 20, idx: 2, weight: 1 }],
    quarters: [
      q(101, 1, 10, '2026-08-01', '2026-10-31'),
      q(102, 2, 10, '2026-11-01', '2027-01-31'),
      q(103, 3, 20, '2027-02-01', '2027-04-30'),
      q(104, 4, 20, '2027-05-01', '2027-07-31'),
    ],
    lessons: [],
    writtenWorks: [],
    students: [{ id: 1, first_name: 'Anna', last_name: 'Abel', klasse_name: '9a' }],
    gradeOverrides: [],
    averageLocks: [],
  };
}

const noop = () => {};

describe('Notenübersicht KLASSENARBEITEN heading', () => {
  beforeEach(() => localStorage.clear());

  it('renders the Ø KLASSENARBEITEN heading with a Klassen|arbeiten break', () => {
    render(
      <Notenuebersicht bundle={makeBundle()} onRefresh={noop} onOpenStudent={noop} onOpenLesson={noop} onOpenWork={noop} allowGradeOverride={false} />
    );
    const heading = screen.getAllByText(
      (_, el) => el?.tagName === 'SPAN' && el.textContent.includes(`KLASSEN${ZWSP}ARBEITEN`)
    );
    expect(heading.length).toBeGreaterThan(0);
  });
});
