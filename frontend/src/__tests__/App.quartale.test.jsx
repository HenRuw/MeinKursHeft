import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.jsx';

// Controls what the year's quarter calendar looks like per test.
let quarters = [];

vi.mock('../api.js', () => ({
  api: {
    getYearContext: vi.fn(async () => ({ years: [{ id: 1, label: '2026/27', sort_order: 0, archived: 0 }], currentYearId: 1 })),
    setCurrentYear: vi.fn(async () => ({})),
    listCourses: vi.fn(async () => []),
    listStudents: vi.fn(async () => []),
    listClasses: vi.fn(async () => []),
    listRemarkPresets: vi.fn(async () => []),
    getCourseBundle: vi.fn(async () => null),
    getYearQuarters: vi.fn(async () => quarters),
    setYearQuarters: vi.fn(async () => quarters),
  },
  subscribeSync: vi.fn(() => () => {}),
}));

const HINT = /erst die Quartale anlegen/i;

describe('Notenübersicht requires a quarter calendar', () => {
  beforeEach(() => {
    window.innerWidth = 1280;
  });

  it('shows the hint and a "Quartale anlegen" action when the year has no quarters', async () => {
    quarters = [];
    render(<App />);
    fireEvent.click(await screen.findByText('Notenübersicht'));

    expect(await screen.findByText(HINT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quartale anlegen' })).toBeInTheDocument();
  });

  it('does not show the hint once the year has quarters', async () => {
    quarters = [
      { idx: 1, start_date: '2026-08-01', end_date: '2026-11-15' },
      { idx: 2, start_date: '2026-11-16', end_date: '2027-01-31' },
      { idx: 3, start_date: '2027-02-01', end_date: '2027-04-15' },
      { idx: 4, start_date: '2027-04-16', end_date: '2027-07-31' },
    ];
    render(<App />);
    fireEvent.click(await screen.findByText('Notenübersicht'));

    await waitFor(() => expect(screen.queryByText(HINT)).not.toBeInTheDocument());
  });
});
