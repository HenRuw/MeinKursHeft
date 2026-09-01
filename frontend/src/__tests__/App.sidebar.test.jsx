import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.jsx';

vi.mock('../api.js', () => ({
  api: {
    getYearContext: vi.fn(async () => ({ years: [{ id: 1, label: '2026/27', sort_order: 0, archived: 0 }], currentYearId: 1 })),
    setCurrentYear: vi.fn(async () => ({})),
    listCourses: vi.fn(async () => []),
    listStudents: vi.fn(async () => []),
    listClasses: vi.fn(async () => []),
    listRemarkPresets: vi.fn(async () => []),
    getCourseBundle: vi.fn(async () => null),
    getYearQuarters: vi.fn(async () => []),
  },
  subscribeSync: vi.fn(() => () => {}),
}));

describe('App sidebar hamburger toggle (desktop)', () => {
  beforeEach(() => {
    // jsdom default width is 1024 -> isDesktop; make sure we're above 1023.
    window.innerWidth = 1280;
  });

  it('collapses and re-expands the in-flow sidebar', async () => {
    render(<App />);
    // Let mount effects settle.
    await waitFor(() => expect(document.querySelector('aside')).toBeTruthy());

    const aside = document.querySelector('aside');
    // Starts open on desktop.
    expect(aside.style.width).toBe('232px');

    // While open, only the in-sidebar hamburger is shown (no white top-bar one).
    expect(screen.queryByLabelText('Menü öffnen')).toBeNull();
    fireEvent.click(screen.getByLabelText('Menü einklappen'));
    expect(aside.style.width).toBe('0px');

    // While collapsed, the top-bar opener appears to re-expand it.
    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    expect(aside.style.width).toBe('232px');
  });

  it('the in-sidebar collapse button also closes it', async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelector('aside')).toBeTruthy());
    const aside = document.querySelector('aside');
    expect(aside.style.width).toBe('232px');

    fireEvent.click(screen.getByLabelText('Menü einklappen'));
    expect(aside.style.width).toBe('0px');
  });
});
