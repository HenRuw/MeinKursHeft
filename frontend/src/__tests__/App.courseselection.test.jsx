import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.jsx';

vi.mock('../api.js', () => ({
  api: {
    getYearContext: vi.fn(async () => ({ years: [{ id: 1, label: '2026/27', sort_order: 0, archived: 0 }], currentYearId: 1 })),
    setCurrentYear: vi.fn(async () => ({})),
    listCourses: vi.fn(async () => [{ id: 1, name: 'Mathe', year_id: 1 }]),
    listStudents: vi.fn(async () => []),
    listClasses: vi.fn(async () => []),
    listRemarkPresets: vi.fn(async () => []),
    // null keeps the course name out of the header/top bar, so "Mathe" only
    // appears in the sidebar.
    getCourseBundle: vi.fn(async () => null),
  },
  subscribeSync: vi.fn(() => () => {}),
}));

describe('App sidebar course selection state', () => {
  beforeEach(() => {
    window.innerWidth = 1280;
  });

  const row = () => screen.getByText('Mathe').closest('div');

  it('highlights the course on its own screens but not in a management menu', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Mathe')).toBeInTheDocument());

    // On a course tab (default 'stunde') the course is the active context.
    expect(row().style.background).not.toBe('transparent');

    // Navigate into the Verwaltung menu -> Schülerdaten.
    fireEvent.click(screen.getByText('Verwaltung'));
    fireEvent.click(await screen.findByText('Schülerdaten'));

    // No specific course is selected there, so nothing is highlighted.
    await waitFor(() => expect(row().style.background).toBe('transparent'));
  });
});
