import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { downloadWorkStatsImage } from '../workStatsImage.js';

// jsdom has no canvas implementation, so we stub document.createElement to hand
// back a recording 2D context (and a no-op <a> for the download) and inspect
// what the renderer drew.
function makeRecordingCtx(record) {
  const ctx = {};
  const methods = [
    'scale', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke',
    'save', 'restore', 'translate', 'rotate',
  ];
  for (const m of methods) ctx[m] = vi.fn();
  ctx.fillText = vi.fn((text) => record.texts.push(String(text)));
  return ctx;
}

describe('downloadWorkStatsImage bar chart axes', () => {
  let record;
  let origCreate;

  beforeEach(() => {
    record = { texts: [] };
    const ctx = makeRecordingCtx(record);
    origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,x' };
      }
      if (tag === 'a') {
        return { click: vi.fn(), remove: vi.fn(), set download(v) {}, set href(v) {} };
      }
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const work = {
    title: 'Klausur 1',
    date: '2026-01-15',
    grades: [
      { student_id: 1, grade: '1' },
      { student_id: 2, grade: '2' },
      { student_id: 3, grade: '2' },
      { student_id: 4, grade: '3' },
    ],
  };
  const students = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

  it('labels both axes with titles', () => {
    downloadWorkStatsImage(work, students);
    expect(record.texts).toContain('Note');
    expect(record.texts).toContain('Anzahl');
  });

  it('draws y-axis tick labels starting at 0', () => {
    downloadWorkStatsImage(work, students);
    // A zero baseline tick label must be present on the count axis.
    expect(record.texts).toContain('0');
    // The tallest bin here has 2 entries, so the axis top tick is 2.
    expect(record.texts).toContain('2');
  });

  it('still labels the grade categories 1..6 on the x-axis', () => {
    downloadWorkStatsImage(work, students);
    for (const d of ['1', '2', '3', '4', '5', '6']) {
      expect(record.texts).toContain(d);
    }
  });

  it('draws the course name when a course is given', () => {
    downloadWorkStatsImage(work, students, { id: 1, name: 'Mathe 9a' });
    expect(record.texts).toContain('Mathe 9a');
  });

  it('omits the course kicker when no course is given', () => {
    downloadWorkStatsImage(work, students);
    expect(record.texts).not.toContain('Mathe 9a');
  });
});
