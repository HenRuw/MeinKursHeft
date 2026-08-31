import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.jsx';

vi.mock('../api.js', () => ({
  api: {
    listCourses: vi.fn(async () => []),
    listStudents: vi.fn(async () => []),
    listKlassen: vi.fn(async () => []),
    listRemarkPresets: vi.fn(async () => []),
    getCourseBundle: vi.fn(async () => null),
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

    const toggle = screen.getByLabelText('Menü umschalten');
    fireEvent.click(toggle);
    expect(aside.style.width).toBe('0px');

    fireEvent.click(toggle);
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
