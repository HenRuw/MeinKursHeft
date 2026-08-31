import { describe, it, expect } from 'vitest';
import { COL_WIDTH } from '../Notenuebersicht.jsx';

// Leaf headers render in IBM Plex Mono at 10px with 0.06em letter-spacing, so
// each glyph advances ~6.6px. The cell is box-sizing:border-box with 4px of
// padding on each side plus its frame's right border, so the text has
// (width - 8 - border) px to wrap in. This mirrors leafHeaderStyle + FRAME in
// Notenuebersicht.jsx.
const CHAR_W = 6.6;
const PAD_X = 8;
const FRAME_BORDER = { schr: 2, year: 5 };

function lineCount(text, colWidth, border) {
  const content = colWidth - PAD_X - border;
  const perLine = Math.max(1, Math.floor(content / CHAR_W));
  return Math.ceil(text.length / perLine);
}

describe('Notenübersicht column widths', () => {
  it('fits "Ø KLASSENARBEITEN" (schrAvg) onto exactly two lines', () => {
    // "Ø" is bound to the word with a non-breaking space (bindLead), so the
    // heading is one 17-char token wrapped by the browser.
    const lines = lineCount('Ø KLASSENARBEITEN', COL_WIDTH.schrAvg, FRAME_BORDER.schr);
    expect(lines).toBe(2);
  });

  it('keeps "ZEUGNIS" on a single line', () => {
    const lines = lineCount('ZEUGNIS', COL_WIDTH.zeugnis, FRAME_BORDER.year);
    expect(lines).toBe(1);
  });

  it('is wider than the old widths that wrapped to three / two lines', () => {
    // Regression guard: the previous 68/58 wrapped Klassenarbeiten to three
    // lines and Zeugnis to two.
    expect(lineCount('Ø KLASSENARBEITEN', 68, FRAME_BORDER.schr)).toBe(3);
    expect(lineCount('ZEUGNIS', 58, FRAME_BORDER.year)).toBe(2);
    expect(COL_WIDTH.schrAvg).toBeGreaterThan(68);
    expect(COL_WIDTH.zeugnis).toBeGreaterThan(58);
  });
});
