import { useRef, useState } from 'react';
import { api } from '../api.js';
import { colors, fonts, QUARTER_ACCENTS } from '../theme.js';
import {
  sortStudents,
  studentDisplayName,
  studentKlasseLabel,
  num,
  fmt,
  wavg,
  gradeColor,
  gradeLabel,
  isNb,
  GRADE_TYPE_SCALE,
  WRITTEN_WORK_KINDS,
  WRITTEN_WORK_GROUP,
  mitarbeitAverage,
  schriftlichAverage,
  resolveAverage,
  averageLockedFor,
  averageColumnLocked,
} from '../lib/gradeMath.js';
import { formatShortDate } from '../lib/dates.js';
import { usePersisted } from '../lib/usePersisted.js';
import { useViewport } from '../lib/useViewport.js';
import { triggerShake } from '../lib/shake.js';
import WeightInput from '../components/WeightInput.jsx';
import SplitKeys from '../components/SplitKeys.jsx';
import Popover from '../components/Popover.jsx';
import LockIcon from '../components/LockIcon.jsx';
import CollapseArrow from '../components/CollapseArrow.jsx';

// Klassenarbeiten sit in the KLASSENARBEITEN (amber) frame; Tests and
// Sonstige Leistungen count toward SONSTIGE MITARBEIT, so they get a tint
// from that (teal) family instead.
const KIND_BG = { klassenarbeit: '#fdf7e9', test: '#e6f0ea', sonstige: '#d9ebe1' };
const KIND_BG_LIGHT = { klassenarbeit: '#fefcf5', test: '#f3f8f5', sonstige: '#eef6f1' };
const KIND_TEXT = { klassenarbeit: colors.gold, test: colors.teal, sonstige: colors.teal };

const FRAME = {
  year: { border: 5, color: colors.sidebarBg },
  half: { border: 4, color: colors.tealDark },
  mit: { border: 2, color: colors.teal },
  schr: { border: 2, color: '#a9791f' },
};

// Every column's width is fixed and known up front instead of measured from
// the DOM -- that's what lets the two sticky columns (Name / Zeugnis) use
// plain `left:0`/`right:0` instead of a ResizeObserver + a layout effect
// recomputing offsets on every render, and what lets the frame borders below
// be plain per-cell CSS instead of the overlay-mask workaround a table would
// need: a CSS Grid item's border is always its own, self-contained box --
// unlike an HTML table's border-collapse, nothing merges it with a
// neighbor's border, so nothing can knock it a subpixel out of alignment
// while a sticky cell scrolls past.
// Every kind but zeugnis carries a WeightInput (free-text "Gewicht" field)
// in its header -- those are a touch wider than the display-only zeugnis
// column so the input isn't flush against the column's own edges.
// Widths trimmed as far as each column's header allows without forcing new
// wraps: the date/Q-Note/HJ-Note/Zeugnis columns had real slack; the "Ø …"
// average columns are floored by their bound "Ø WORD" token so they shrink
// least; Name stays wide enough not to ellipsise typical student names.
// schrAvg is wide enough for "Ø KLASSENARBEITEN" to wrap onto two lines (not
// three), and zeugnis wide enough for "ZEUGNIS" to stay on a single line.
export const COL_WIDTH = { name: 210, lesson: 54, exam: 70, mitAvg: 76, schrAvg: 84, qNote: 64, hjNote: 68, zeugnis: 68 };
const NAME_BORDER_COLOR = colors.tealDark;

// Thin vertical rule separating one individual grade column (a single lesson
// or exam) from the next. Kept much lighter than the colored frame borders
// (mit/schr/quarter/half/year) so it reads only as a subtle cell divider, not
// a frame edge -- applied to the lesson/exam leaf header, its Gewichtung cell
// and every body cell so it runs as one continuous line top to bottom.
const GRADE_SEP = '1px solid rgba(0,0,0,.08)';

// Keeps a leading Ø or "1."/"2." … number in a column heading from wrapping
// onto its own line: binds it to the first word with a non-breaking space so
// it always sits directly before that word.
const bindLead = (label) => (label || '').replace(/^(Ø|\d+\.)\s+/, '$1 ');

// Header grid rows, top to bottom; body rows start right after. `weight` is
// its own row rather than living at the bottom of each label cell, so every
// Gewicht field -- lesson, exam, Ø SONSTIGE MITARBEIT/Ø KLASSENARBEITEN,
// Q-Note, HJ-Note -- lines up
// in one strip directly above the first student row.
// `lock` is its own strip directly above `weight`: one padlock per column that
// freezes that column's whole data set and its Gewichtung against editing.
const ROW = { year: 1, half: 2, quarter: 3, mitSchr: 4, kindOrKlassen: 5, examTitle: 6, lock: 7, weight: 8 };
const HEADER_ROWS = 8;
const BODY_START = HEADER_ROWS + 1;

// Builds the flat, collapse-aware column list the whole grid is laid out
// from: `leaves` is one entry per actual data/average column, in on-screen
// order (Name is always grid column 1 and handled separately, not a leaf).
// `groups` is one entry per collapsible frame header (year/half/quarter/
// mitarbeit/klassenarbeiten) -- each just a {start, end} range over
// `leaves`, so its on-screen position is pure index arithmetic, never a DOM
// measurement. Tests/Sonstige Leistungen/Klassenarbeiten titles are plain
// leaves with no group of their own -- shown uncategorized, one flat list
// per frame.
//
// Collapsing a frame only ever removes its own *detail* leaves -- its own
// average/summary leaf (mitAvg, qNote, hjNote, ...) is always still pushed,
// same as its underlying value is always still calculated regardless of
// what's currently visible (see calcAverages below).
function buildColumns(bundle, collapsed, toggles) {
  const halves = [...bundle.halves].sort((a, b) => a.idx - b.idx);
  const quarters = [...bundle.quarters].sort((a, b) => a.idx - b.idx);
  const quartersByHalf = (half) => quarters.filter((q) => q.half_id === half.id);

  const leaves = [];
  const groups = [];

  if (!collapsed.year) {
    halves.forEach((half) => {
      const hCollapsed = !!collapsed.half[half.id];
      const halfStart = leaves.length;
      if (!hCollapsed) {
        quartersByHalf(half).forEach((quarter) => {
          const qCollapsed = !!collapsed.quarter[quarter.id];
          const quarterStart = leaves.length;
          const accent = QUARTER_ACCENTS[(quarter.idx - 1) % QUARTER_ACCENTS.length];
          if (!qCollapsed) {
            const mitCollapsed = !!collapsed.mit[quarter.id];
            const schrCollapsed = !!collapsed.schr[quarter.id];
            const kindGroups = WRITTEN_WORK_KINDS.map((k) => ({
              kind: k.value,
              works: bundle.writtenWorks.filter((w) => w.quarter_id === quarter.id && w.kind === k.value).sort((a, b) => a.date.localeCompare(b.date)),
            }));
            const mitKindGroups = kindGroups.filter((g) => WRITTEN_WORK_GROUP[g.kind] === 'mitarbeit');
            const schrKindGroups = kindGroups.filter((g) => WRITTEN_WORK_GROUP[g.kind] === 'schriftlich');

            const mitStart = leaves.length;
            if (!mitCollapsed) {
              // A lesson nobody has been graded in yet would just be an
              // empty column -- leave it off until at least one grade is
              // entered (calcAverages below ignores ungraded lessons either
              // way, so this filter never changes an average, only display).
              bundle.lessons
                .filter((l) => l.quarter_id === quarter.id && l.grades.some((g) => g.grade))
                .sort((a, b) => a.date.localeCompare(b.date))
                .forEach((lesson) => leaves.push({ kind: 'lesson', width: COL_WIDTH.lesson, lesson, quarter }));
              // Tests and Sonstige Leistungen sit alongside lessons with no
              // sub-header of their own (like Klassenarbeiten's own `direct`
              // titles below) -- shown uncategorized, just each keeping its
              // own kind's tint via KIND_BG/KIND_TEXT.
              mitKindGroups.forEach((g) => g.works.forEach((work) => leaves.push({ kind: 'exam', examKind: g.kind, width: COL_WIDTH.exam, work, quarter, direct: true })));
            }
            const mitAvgLeaf = { kind: 'mitAvg', width: COL_WIDTH.mitAvg, quarter };
            leaves.push(mitAvgLeaf);
            const mitEnd = leaves.length;
            groups.push({ key: `mit-${quarter.id}`, level: 'mit', label: 'SONSTIGE MITARBEIT', quarter, start: mitStart, end: mitEnd, collapsed: mitCollapsed, onToggle: () => toggles.mit(quarter.id) });

            const schrStart = leaves.length;
            if (!schrCollapsed) {
              // Klassenarbeiten are the only kind in this frame (now
              // labelled KLASSENARBEITEN itself), so each title is anchored
              // directly -- no separate kind sub-header, unlike Tests/
              // Sonstige above.
              schrKindGroups.forEach((g) => g.works.forEach((work) => leaves.push({ kind: 'exam', examKind: g.kind, width: COL_WIDTH.exam, work, quarter, direct: true })));
            }
            const schrAvgLeaf = { kind: 'schrAvg', width: COL_WIDTH.schrAvg, quarter };
            leaves.push(schrAvgLeaf);
            const schrEnd = leaves.length;
            groups.push({ key: `schr-${quarter.id}`, level: 'schr', label: 'KLASSENARBEITEN', quarter, start: schrStart, end: schrEnd, collapsed: schrCollapsed, onToggle: () => toggles.schr(quarter.id) });
          }
          const qNoteLeaf = { kind: 'qNote', width: COL_WIDTH.qNote, quarter, accent };
          leaves.push(qNoteLeaf);
          const quarterEnd = leaves.length;
          groups.push({
            key: `quarter-${quarter.id}`,
            level: 'quarter',
            label: `${quarter.idx}. QUARTAL`,
            start: quarterStart,
            end: quarterEnd,
            collapsed: qCollapsed,
            onToggle: () => toggles.quarter(quarter.id),
            accent,
          });
        });
      }
      const hjNoteLeaf = { kind: 'hjNote', width: COL_WIDTH.hjNote, half };
      leaves.push(hjNoteLeaf);
      const halfEnd = leaves.length;
      groups.push({ key: `half-${half.id}`, level: 'half', label: `${half.idx}. HALBJAHR`, start: halfStart, end: halfEnd, collapsed: hCollapsed, onToggle: () => toggles.half(half.id) });
    });
  }
  leaves.push({ kind: 'zeugnis', width: COL_WIDTH.zeugnis });
  // start:0 makes this frame begin at the first data column (column 2), the
  // same left edge the half and quarter frames start from -- so GANZES
  // SCHULJAHR shares their start point instead of reaching one column further
  // left over Name's own column. The Name header cell is extended up into this
  // (year) row to fill column 1, so nothing gaps where the bar used to reach.
  groups.push({ key: 'year', level: 'year', label: 'GANZES SCHULJAHR', start: 0, end: leaves.length, collapsed: collapsed.year, onToggle: toggles.year });

  return { leaves, groups };
}

// Calculates every average for one student across the *entire* bundle,
// independent of collapse state -- collapsing a frame only hides its detail
// columns from the grid buildColumns produces above, it must never change a
// roll-up value derived from those columns.
function calcAverages(bundle, overrides, studentId, courseId) {
  const mitByQuarter = new Map();
  const schrByQuarter = new Map();
  bundle.quarters.forEach((quarter) => {
    const lessons = bundle.lessons.filter((l) => l.quarter_id === quarter.id);
    const works = bundle.writtenWorks.filter((w) => w.quarter_id === quarter.id);
    mitByQuarter.set(quarter.id, resolveAverage(overrides, studentId, 'mitAvg', quarter.id, mitarbeitAverage(studentId, lessons, works)));
    schrByQuarter.set(quarter.id, resolveAverage(overrides, studentId, 'schrAvg', quarter.id, schriftlichAverage(studentId, works)));
  });
  const qNoteByQuarter = new Map();
  bundle.quarters.forEach((quarter) => {
    const mit = mitByQuarter.get(quarter.id);
    const schr = schrByQuarter.get(quarter.id);
    const calc = wavg([
      [mit.value, quarter.weight_mitarbeit],
      [schr.value, quarter.weight_schriftlich],
    ]);
    qNoteByQuarter.set(quarter.id, resolveAverage(overrides, studentId, 'qNote', quarter.id, calc));
  });
  const hjByHalf = new Map();
  bundle.halves.forEach((half) => {
    const qVals = bundle.quarters.filter((q) => q.half_id === half.id).map((q) => [qNoteByQuarter.get(q.id).value, q.weight_quarter]);
    hjByHalf.set(half.id, resolveAverage(overrides, studentId, 'hjNote', half.id, wavg(qVals)));
  });
  const zeugnisCalc = wavg(bundle.halves.map((h) => [hjByHalf.get(h.id).value, h.weight]));
  const zeugnis = resolveAverage(overrides, studentId, 'zeugnis', courseId, zeugnisCalc);
  return { mitByQuarter, schrByQuarter, qNoteByQuarter, hjByHalf, zeugnis };
}

const gradeOf = (list, studentId) => list.find((x) => x.student_id === studentId)?.grade || null;

export default function Notenuebersicht({ bundle, onRefresh, onOpenStudent, onOpenLesson, onOpenWork, allowGradeOverride }) {
  // Schueleransicht embeds this component with a bundle.course.id swapped
  // for a synthetic one (so its collapse preferences below don't leak into
  // the real course-wide Notenübersicht) -- realCourseId is the actual id
  // grade-override API calls and the Zeugnis average need to hit.
  const courseId = bundle.realCourseId ?? bundle.course.id;
  const overrides = bundle.gradeOverrides || [];
  const avgLocks = bundle.averageLocks || [];
  const isAvgLocked = (studentId, kind, refId) => averageLockedFor(avgLocks, studentId, kind, refId);
  const [overrideEdit, setOverrideEdit] = useState(null); // { studentId, kind, refId, grade }
  const overrideAnchorRef = useRef(null);
  // One ref per SPERRE-row column lock, keyed "kind-refId" for average columns,
  // so a click on a locked average cell can shake that column's single top lock
  // instead of every cell carrying its own padlock.
  const columnLockRefs = useRef({});
  const avgLockKey = (kind, refId) => `${kind}-${refId}`;
  // Every mutation here refetches the bundle itself rather than trusting the
  // WebSocket broadcast to bring the change back -- the live-sync socket isn't
  // guaranteed to reach the client (e.g. a reverse proxy that doesn't forward
  // WebSocket upgrades), and without a local refetch a click would change the
  // database but never update the view. Mirrors the entry screens' .then(onRefresh).
  const refresh = () => onRefresh && onRefresh();
  const setOverrideGrade = (grade) => {
    const { studentId, kind, refId } = overrideEdit;
    api.setGradeOverride(courseId, { studentId, kind, refId, grade }).then(refresh);
    setOverrideEdit(null);
  };
  const openOverrideEdit = (studentId, kind, refId, grade, el) => {
    overrideAnchorRef.current = el;
    setOverrideEdit({ studentId, kind, refId, grade });
  };
  // Clicking an average cell: a locked one just shakes this column's top lock
  // (the lock lives only in the SPERRE row now); an unlocked one opens the
  // manual-override popover.
  const avgCellClick = (studentId, kind, refId, grade) => (e) => {
    if (averageLockedFor(avgLocks, studentId, kind, refId)) triggerShake(columnLockRefs.current[avgLockKey(kind, refId)]);
    else openOverrideEdit(studentId, kind, refId, grade, e.currentTarget);
  };

  // --- column locks (the Notenübersicht lock row) ---
  // Only the course-wide view manages column locks; the embedded single-
  // student view (Schueleransicht) toggles just that one student's cell.
  const isCourseWide = !bundle.realCourseId;
  // An average column is "locked" when every enrolled student's cell is --
  // in the solo bundle that collapses to the one student shown there.
  const isAvgColumnLocked = (kind, refId) => averageColumnLocked(avgLocks, bundle.students, kind, refId);
  const toggleAvgColumnLock = (kind, refId) => {
    const locked = !isAvgColumnLocked(kind, refId);
    if (isCourseWide) api.setAverageLockColumn(courseId, { kind, refId, locked }).then(refresh);
    else {
      const sid = bundle.students[0]?.id;
      if (sid != null) api.setAverageLock(courseId, { studentId: sid, kind, refId, locked }).then(refresh);
    }
  };
  const toggleLessonLock = (lesson) => api.updateLesson(lesson.id, { gradesLocked: !lesson.grades_locked }).then(refresh);
  const toggleWorkLock = (work) => api.updateWrittenWork(work.id, { gradesLocked: !work.grades_locked }).then(refresh);

  // Whether a leaf column's data set + weight are locked, and how to toggle it.
  const leafColumnLocked = (l) => {
    if (l.kind === 'lesson') return !!l.lesson.grades_locked;
    if (l.kind === 'exam') return !!l.work.grades_locked;
    if (l.kind === 'mitAvg') return isAvgColumnLocked('mitAvg', l.quarter.id);
    if (l.kind === 'schrAvg') return isAvgColumnLocked('schrAvg', l.quarter.id);
    if (l.kind === 'qNote') return isAvgColumnLocked('qNote', l.quarter.id);
    if (l.kind === 'hjNote') return isAvgColumnLocked('hjNote', l.half.id);
    if (l.kind === 'zeugnis') return isAvgColumnLocked('zeugnis', courseId);
    return false;
  };
  const leafToggleLock = (l) => {
    if (l.kind === 'lesson') return toggleLessonLock(l.lesson);
    if (l.kind === 'exam') return toggleWorkLock(l.work);
    if (l.kind === 'mitAvg') return toggleAvgColumnLock('mitAvg', l.quarter.id);
    if (l.kind === 'schrAvg') return toggleAvgColumnLock('schrAvg', l.quarter.id);
    if (l.kind === 'qNote') return toggleAvgColumnLock('qNote', l.quarter.id);
    if (l.kind === 'hjNote') return toggleAvgColumnLock('hjNote', l.half.id);
    if (l.kind === 'zeugnis') return toggleAvgColumnLock('zeugnis', courseId);
  };
  // A manual override keeps its pencil badge; a locked average carries no
  // padlock of its own -- the lock lives in the SPERRE row -- and is just
  // greyed out to read as "not editable here".
  const renderAvg = (value, overridden, onClick, grade, locked) => {
    const inner = (
      <>
        {isNb(grade) ? 'n.b.' : fmt(value)}
        {overridden && (
          <span title="Manuell eingetragen – nicht berechnet" style={{ marginLeft: 3, fontSize: 8 }}>
            ✎
          </span>
        )}
      </>
    );
    return onClick ? (
      <button onClick={onClick} style={{ display: 'block', width: '100%', font: 'inherit', color: 'inherit', opacity: locked ? 0.45 : 1 }}>
        {inner}
      </button>
    ) : (
      inner
    );
  };

  const { isMobile } = useViewport();
  const [collapsed, setCollapsed] = usePersisted(`notenuebersicht:${bundle.course.id}:collapsed`, {
    year: false,
    half: {},
    quarter: {},
    mit: {},
    schr: {},
  });
  const toggles = {
    year: () => setCollapsed((c) => ({ ...c, year: !c.year })),
    half: (id) => setCollapsed((c) => ({ ...c, half: { ...c.half, [id]: !c.half[id] } })),
    quarter: (id) => setCollapsed((c) => ({ ...c, quarter: { ...c.quarter, [id]: !c.quarter[id] } })),
    mit: (qid) => setCollapsed((c) => ({ ...c, mit: { ...c.mit, [qid]: !c.mit[qid] } })),
    schr: (qid) => setCollapsed((c) => ({ ...c, schr: { ...c.schr, [qid]: !c.schr[qid] } })),
  };

  const students = sortStudents(bundle.students);

  // "26/27", derived from the quarters' date range, shown in the otherwise
  // empty top-left header cell above the Name column.
  const schoolYearLabel = (() => {
    const years = bundle.quarters
      .flatMap((q) => [q.start_date, q.end_date])
      .filter(Boolean)
      .map((d) => Number(String(d).slice(0, 4)))
      .filter((y) => !Number.isNaN(y));
    if (!years.length) return '';
    return `${String(Math.min(...years)).slice(2)}/${String(Math.max(...years)).slice(2)}`;
  })();
  const { leaves, groups } = buildColumns(bundle, collapsed, toggles);

  const setQuarterWeight = (quarter, field) => (weight) => api.updateQuarter(quarter.id, { [field]: weight }).then(refresh);
  const setHalfWeight = (half) => (weight) => api.updateHalf(half.id, { weight }).then(refresh);

  // Leaf index (0-based, Name excluded) -> grid column *line*: column 1 is
  // Name, so leaf 0 starts at line 2.
  const colLine = (leafIdx) => leafIdx + 2;
  const totalCols = leaves.length + 1;
  const gridTemplateColumns = `${COL_WIDTH.name}px ${leaves.map((l) => `${l.width}px`).join(' ')}`;

  // --- shared cell styles ---
  // Frame group headers (year/half/quarter/mitarbeit/klassenarbeiten) are
  // left/top-aligned, not centered: their own left edge is where the frame
  // *starts* and their own top edge is where their row *starts*, and neither
  // position moves when the frame's own collapse toggle fires (only content
  // before/above it can shift those) -- centering across the full,
  // collapse-dependent width or height would instead fling the arrow to a
  // new spot on every click (width when the label wraps onto more lines,
  // height once a too-narrow label switches to vertical text below).
  const groupBaseStyle = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 4,
    padding: '5px 8px',
    font: `500 10px ${fonts.mono}`,
    letterSpacing: '.06em',
    justifyContent: 'flex-start',
    textAlign: 'left',
  };
  // Leaf headers (individual columns): bottom-anchored so every one of them
  // -- lesson dates, exam titles, Ø SONSTIGE MITARBEIT/Ø KLASSENARBEITEN,
  // Q-Note, HJ-Note, Zeugnis -- sits directly in the row right above
  // Gewichtung, regardless of how many rows its own cell spans (Zeugnis
  // spans far more of the header than a lesson date does). A label too wide
  // for its column still wraps upward from there onto more lines instead of
  // overflowing.
  //
  // No `alignItems: 'center'` here (default is 'stretch'): the label span
  // has no width of its own, so stretching it to the full column width is
  // what lets it actually wrap within that width instead of shrink-wrapping
  // to its unbroken text size. `overflow:hidden` stays only as a
  // last-resort safety net -- the grid row itself grows to fit however many
  // lines a label wraps to, so it's normally never triggered.
  const leafHeaderStyle = (extra) => ({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    gap: 2,
    padding: '5px 4px 6px',
    font: `500 10px ${fonts.mono}`,
    color: colors.mutedStrong,
    letterSpacing: '.06em',
    textAlign: 'center',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    overflow: 'hidden',
    borderBottom: `1px solid ${colors.border}`,
    ...extra,
  });
  const td = (extra) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 6px',
    borderBottom: `1px solid ${colors.divider}`,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    ...extra,
  });
  // The dedicated Gewichtung row: same background/frame-border language as
  // the label cell directly above each column, just centered on the input
  // alone instead of stacking a label above it.
  const weightRowStyle = (extra) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 4px 6px',
    borderBottom: `1px solid ${colors.border}`,
    ...extra,
  });

  // --- group (frame) header rendering ---
  const GROUP_ROW = { year: ROW.year, half: ROW.half, quarter: ROW.quarter, mit: ROW.mitSchr, schr: ROW.mitSchr };
  const GROUP_BG = { year: colors.sidebarBg, half: colors.hBg, quarter: colors.qBg, mit: colors.mitBgStrong, schr: colors.schBgStrong };
  const GROUP_COLOR = { year: '#fff', half: colors.tealDark, quarter: colors.mutedStrong, mit: colors.mutedStrong, schr: colors.mutedStrong };
  const GROUP_WEIGHT = { year: 700, half: 700, quarter: 600, mit: 500, schr: 500 };

  const renderGroup = (g) => {
    const row = GROUP_ROW[g.level];
    const gridColumn = `${colLine(g.start)} / ${colLine(g.end)}`;
    const gridRow = `${row} / ${row + 1}`;
    const borderColor = g.level === 'quarter' ? g.accent : FRAME[g.level].color;
    const borderWidth = g.level === 'quarter' ? 3 : FRAME[g.level].border;
    // Half/Quarter/Mitarbeit/Klassenarbeiten shrink to just their own
    // average column's width (~44-52px) -- too narrow for the label to wrap
    // horizontally (word-break degenerates into one character per line at
    // that width). Its label isn't rendered here at all in that case --
    // buildColumns already attached it (as narrowGroupLabel) to this frame's
    // own average leaf instead, which renderLeafHeader stacks above its own
    // label using ordinary document flow, so the grid can size that multi-
    // row cell for real instead of guessing. This row keeps only the arrow,
    // which needs no more height than the arrow itself.
    const narrow = g.end - g.start <= 1 && g.level !== 'year';
    // Arrow *before* the label, not after: the label wraps onto further
    // lines (below) rather than truncating once its frame is too narrow to
    // fit it on one line, which would drag a trailing arrow sideways along
    // with it. Leading the label instead pins the arrow at
    // frameStart+padding -- a fixed offset that never depends on how the
    // label ends up wrapping.
    const content = (
      <>
        <CollapseArrow collapsed={g.collapsed} onClick={g.onToggle} dark={g.level === 'year'} collapsedGlyph="▶" />
        {!narrow && (
          <span style={{ minWidth: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{bindLead(g.label)}</span>
        )}
      </>
    );
    const isYear = g.level === 'year';
    return (
      <div
        key={g.key}
        style={{
          ...groupBaseStyle,
          gridColumn,
          gridRow,
          background: GROUP_BG[g.level],
          color: GROUP_COLOR[g.level],
          fontWeight: GROUP_WEIGHT[g.level],
          // No borderLeft, even for half (unlike an earlier version of
          // this): it only ever existed on this one row, so where a half's
          // left edge meets Name's own (thinner, but genuinely continuous
          // top-to-bottom) border, that extra 4px only on the header row
          // read as thicker there than everywhere below it. Name's own
          // border is already the consistent divider; this would just
          // double it up unevenly.
          borderTop: `${borderWidth}px solid ${borderColor}`,
          borderRight: `${borderWidth}px solid ${borderColor}`,
          // Padding moves onto the inner sticky wrapper below for the year
          // level, so it stays put whether or not that wrapper is currently
          // stuck.
          ...(isYear ? { padding: 0 } : null),
        }}
      >
        {isYear ? (
          // GANZES SCHULJAHR's own bar spans the *entire* table width -- and
          // that's exactly why `position: sticky` on the bar itself does
          // nothing: a sticky element can only ever move within the bounds
          // of its own containing block, and this bar's containing block
          // (the grid) is already exactly as wide as the bar, leaving no
          // room for it to shift into as you scroll. Wrapping just the
          // label/arrow in their own, much narrower sticky element gives
          // that inner element real room to move within the (still normally
          // scrolling) bar, the same way Name's column does -- keeping the
          // heading and the toggle to collapse the whole year reachable
          // while scrolling through a wide table, without the bar itself
          // needing to "stick" (it doesn't need to; its background/border
          // already span the full width regardless of scroll position).
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 8px',
              position: isMobile ? 'static' : 'sticky',
              left: isMobile ? undefined : 0,
              zIndex: 4,
            }}
          >
            {content}
          </span>
        ) : (
          content
        )}
      </div>
    );
  };

  // --- leaf header rendering ---
  // Every rowSpan below ends at ROW.weight, not BODY_START: the label stops
  // one row short of where it used to, leaving that last row free for the
  // dedicated Gewichtung strip rendered separately by renderWeightCell.
  const renderLeafHeader = (l, i) => {
    const gridColumn = `${colLine(i)} / ${colLine(i) + 1}`;
    if (l.kind === 'lesson') {
      // Just the date, no weekday (by request).
      const { label } = formatShortDate(l.lesson.date);
      return (
        <div key={`l${i}`} style={leafHeaderStyle({ gridColumn, gridRow: `${ROW.kindOrKlassen} / ${ROW.lock}`, background: colors.mitBgStrong, borderRight: GRADE_SEP })}>
          <span>{label}</span>
        </div>
      );
    }
    if (l.kind === 'exam') {
      const rowStart = l.direct ? ROW.kindOrKlassen : ROW.examTitle;
      return (
        <div
          key={`e${i}`}
          style={leafHeaderStyle({
            gridColumn,
            gridRow: `${rowStart} / ${ROW.lock}`,
            background: KIND_BG[l.examKind],
            color: KIND_TEXT[l.examKind],
            borderRight: GRADE_SEP,
            ...(l.firstInKind ? { borderLeft: `2px solid ${colors.borderStrong}` } : null),
          })}
        >
          <span>{bindLead(l.work.title)}</span>
        </div>
      );
    }
    if (l.kind === 'mitAvg') {
      return (
        <div
          key={`ma${i}`}
          style={leafHeaderStyle({
            gridColumn,
            gridRow: `${ROW.kindOrKlassen} / ${ROW.lock}`,
            background: colors.mitBgStrong,
            color: colors.teal,
            fontWeight: 600,
            borderRight: `${FRAME.mit.border}px solid ${FRAME.mit.color}`,
          })}
        >
          {/* Even when this frame is collapsed to just its own average
              column, the horizontal "Ø …" name stays (per request) rather
              than switching to a vertical frame heading. */}
          <span>{bindLead('Ø SONSTIGE MITARBEIT')}</span>
        </div>
      );
    }
    if (l.kind === 'schrAvg') {
      return (
        <div
          key={`sa${i}`}
          style={leafHeaderStyle({
            gridColumn,
            gridRow: `${ROW.kindOrKlassen} / ${ROW.lock}`,
            background: colors.schBgStrong,
            color: colors.gold,
            fontWeight: 600,
            borderRight: `${FRAME.schr.border}px solid ${FRAME.schr.color}`,
          })}
        >
          <span>{bindLead('Ø KLASSENARBEITEN')}</span>
        </div>
      );
    }
    if (l.kind === 'qNote') {
      return (
        <div
          key={`q${i}`}
          style={leafHeaderStyle({
            gridColumn,
            gridRow: `${ROW.mitSchr} / ${ROW.lock}`,
            background: colors.qBg,
            color: colors.teal,
            fontWeight: 700,
            borderRight: `3px solid ${l.accent}`,
          })}
        >
          <span>{l.quarter.idx}.Q-NOTE</span>
        </div>
      );
    }
    if (l.kind === 'hjNote') {
      // No `position: sticky` here (unlike Zeugnis below) -- the
      // Halbjahresnote columns scroll away with the rest of the table now,
      // by request, since keeping every half's own note pinned was the main
      // source of both the ResizeObserver-driven lag and the border
      // continuity bugs.
      return (
        <div
          key={`h${i}`}
          style={leafHeaderStyle({
            gridColumn,
            gridRow: `${ROW.quarter} / ${ROW.lock}`,
            background: colors.hBg,
            color: colors.tealDark,
            fontWeight: 700,
            borderRight: `${FRAME.half.border}px solid ${FRAME.half.color}`,
          })}
        >
          <span>{l.half.idx}.HJ-Note</span>
        </div>
      );
    }
    // zeugnis -- the only column besides Name that stays pinned while
    // scrolling horizontally.
    return (
      <div
        key="zeugnis"
        style={leafHeaderStyle({
          gridColumn,
          gridRow: `${ROW.half} / ${ROW.lock}`,
          background: colors.sidebarBg,
          color: '#fff',
          fontWeight: 700,
          borderRight: `${FRAME.year.border}px solid ${FRAME.year.color}`,
          position: isMobile ? 'static' : 'sticky',
          right: isMobile ? undefined : 0,
          zIndex: 2,
        })}
      >
        ZEUGNIS
      </div>
    );
  };

  // --- dedicated lock row (one padlock per column, directly above the
  // Gewichtung strip). A closed shackle means the column's whole data set and
  // its weight are frozen; an open shackle means editable.
  // Same per-column background/frame-border language as the weight cell below.
  const lockRowStyle = (extra) => ({ ...weightRowStyle(extra), padding: '3px 4px 3px' });
  // The "kind-refId" key an average column's top lock is registered under, so
  // a locked average cell can shake it (see avgCellClick); null for lesson/exam.
  const lockRefKey = (l) => {
    if (l.kind === 'mitAvg') return avgLockKey('mitAvg', l.quarter.id);
    if (l.kind === 'schrAvg') return avgLockKey('schrAvg', l.quarter.id);
    if (l.kind === 'qNote') return avgLockKey('qNote', l.quarter.id);
    if (l.kind === 'hjNote') return avgLockKey('hjNote', l.half.id);
    if (l.kind === 'zeugnis') return avgLockKey('zeugnis', courseId);
    return null;
  };
  const LockToggle = ({ l }) => {
    const locked = leafColumnLocked(l);
    const key = lockRefKey(l);
    return (
      <button
        ref={key ? (el) => { columnLockRefs.current[key] = el; } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          leafToggleLock(l);
        }}
        title={locked ? 'Datensatz & Gewichtung entsperren' : 'Datensatz & Gewichtung sperren'}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 16, borderRadius: 4, background: 'transparent', color: locked ? colors.gold : colors.faint }}
      >
        <LockIcon open={!locked} size={13} />
      </button>
    );
  };
  const renderLockCell = (l, i) => {
    const gridColumn = `${colLine(i)} / ${colLine(i) + 1}`;
    const gridRow = `${ROW.lock} / ${ROW.weight}`;
    const bg = {
      lesson: colors.mitBgStrong,
      exam: l.kind === 'exam' ? KIND_BG[l.examKind] : undefined,
      mitAvg: colors.mitBgStrong,
      schrAvg: colors.schBgStrong,
      qNote: colors.qBg,
      hjNote: colors.hBg,
      zeugnis: colors.sidebarBg,
    }[l.kind];
    const borderRight =
      l.kind === 'lesson' || l.kind === 'exam'
        ? GRADE_SEP
        : l.kind === 'mitAvg'
          ? `${FRAME.mit.border}px solid ${FRAME.mit.color}`
          : l.kind === 'schrAvg'
            ? `${FRAME.schr.border}px solid ${FRAME.schr.color}`
            : l.kind === 'qNote'
              ? `3px solid ${l.accent}`
              : l.kind === 'hjNote'
                ? `${FRAME.half.border}px solid ${FRAME.half.color}`
                : `${FRAME.year.border}px solid ${FRAME.year.color}`;
    const sticky = l.kind === 'zeugnis' ? { position: isMobile ? 'static' : 'sticky', right: isMobile ? undefined : 0, zIndex: 2 } : null;
    return (
      <div key={`lock${i}`} style={{ ...lockRowStyle({ gridColumn, gridRow, background: bg, borderRight, ...(l.firstInKind ? { borderLeft: `2px solid ${colors.borderStrong}` } : null) }), ...sticky }}>
        <LockToggle l={l} />
      </div>
    );
  };

  // --- dedicated Gewichtung row (one cell per leaf, directly above the
  // first student row) -- background/frame-border matches the label cell
  // right above it, so the column's own visual identity stays continuous
  // straight through into the body. Zeugnis has no weight of its own, so
  // its cell here is just a blank, matching-background placeholder.
  const renderWeightCell = (l, i) => {
    const gridColumn = `${colLine(i)} / ${colLine(i) + 1}`;
    const gridRow = `${ROW.weight} / ${BODY_START}`;
    if (l.kind === 'lesson') {
      return (
        <div key={`wl${i}`} style={weightRowStyle({ gridColumn, gridRow, background: colors.mitBgStrong, borderRight: GRADE_SEP })}>
          <WeightInput value={l.lesson.weight} onChange={(weight) => api.updateLesson(l.lesson.id, { weight }).then(refresh)} disabled={leafColumnLocked(l)} />
        </div>
      );
    }
    if (l.kind === 'exam') {
      return (
        <div
          key={`we${i}`}
          style={weightRowStyle({ gridColumn, gridRow, background: KIND_BG[l.examKind], borderRight: GRADE_SEP, ...(l.firstInKind ? { borderLeft: `2px solid ${colors.borderStrong}` } : null) })}
        >
          <WeightInput value={l.work.weight} onChange={(weight) => api.updateWrittenWork(l.work.id, { weight }).then(refresh)} disabled={leafColumnLocked(l)} />
        </div>
      );
    }
    if (l.kind === 'mitAvg') {
      return (
        <div key={`wma${i}`} style={weightRowStyle({ gridColumn, gridRow, background: colors.mitBgStrong, borderRight: `${FRAME.mit.border}px solid ${FRAME.mit.color}` })}>
          <WeightInput value={l.quarter.weight_mitarbeit} onChange={setQuarterWeight(l.quarter, 'weightMitarbeit')} disabled={leafColumnLocked(l)} />
        </div>
      );
    }
    if (l.kind === 'schrAvg') {
      return (
        <div key={`wsa${i}`} style={weightRowStyle({ gridColumn, gridRow, background: colors.schBgStrong, borderRight: `${FRAME.schr.border}px solid ${FRAME.schr.color}` })}>
          <WeightInput value={l.quarter.weight_schriftlich} onChange={setQuarterWeight(l.quarter, 'weightSchriftlich')} disabled={leafColumnLocked(l)} />
        </div>
      );
    }
    if (l.kind === 'qNote') {
      return (
        <div key={`wq${i}`} style={weightRowStyle({ gridColumn, gridRow, background: colors.qBg, borderRight: `3px solid ${l.accent}` })}>
          <WeightInput value={l.quarter.weight_quarter} onChange={setQuarterWeight(l.quarter, 'weightQuarter')} disabled={leafColumnLocked(l)} />
        </div>
      );
    }
    if (l.kind === 'hjNote') {
      return (
        <div key={`wh${i}`} style={weightRowStyle({ gridColumn, gridRow, background: colors.hBg, borderRight: `${FRAME.half.border}px solid ${FRAME.half.color}` })}>
          <WeightInput value={l.half.weight} onChange={setHalfWeight(l.half)} disabled={leafColumnLocked(l)} />
        </div>
      );
    }
    // zeugnis
    return (
      <div
        key="wzeugnis"
        style={{
          ...weightRowStyle({ gridColumn, gridRow, background: colors.sidebarBg, borderRight: `${FRAME.year.border}px solid ${FRAME.year.color}` }),
          position: isMobile ? 'static' : 'sticky',
          right: isMobile ? undefined : 0,
          zIndex: 2,
        }}
      />
    );
  };

  // --- body rendering ---
  // The body is its own grid below the sticky header grid, so its rows are
  // 1-based (row 1 = first student), not offset by the header's height.
  const renderBodyRow = (s, rowIdx) => {
    const row = rowIdx + 1;
    const avgs = calcAverages(bundle, overrides, s.id, courseId);

    const nameCell = (
      <div
        key="name"
        style={{
          ...td({
            justifyContent: 'flex-start',
            textAlign: 'left',
            background: rowIdx % 2 ? colors.cream : '#fff',
            borderRight: `${2}px solid ${NAME_BORDER_COLOR}`,
          }),
          gridColumn: '1 / 2',
          gridRow: `${row} / ${row + 1}`,
          position: 'sticky',
          left: 0,
          zIndex: 1,
        }}
      >
        <button onClick={() => onOpenStudent(s.id, 'matrix')} style={{ textAlign: 'left', fontWeight: 500, fontSize: 13 }}>
          {rowIdx + 1}. {studentDisplayName(s)}
          {studentKlasseLabel(s) && <span style={{ marginLeft: 6, fontWeight: 500, fontSize: 10.5, color: colors.muted }}>{studentKlasseLabel(s)}</span>}
        </button>
      </div>
    );

    const leafCells = leaves.map((l, i) => {
      const gridColumn = `${colLine(i)} / ${colLine(i) + 1}`;
      const gridRow = `${row} / ${row + 1}`;
      const key = `${l.kind}${i}`;

      if (l.kind === 'lesson') {
        const g = gradeOf(l.lesson.grades, s.id);
        const v = num(g);
        // An absence has no grade of its own -- show who was missing and
        // whether it was excused right in the grade cell instead: a red "F"
        // for unentschuldigt, a green "E" for entschuldigt.
        const att = l.lesson.attendance.find((a) => a.student_id === s.id);
        const absent = att?.status === 'fehlt';
        const label = absent ? (att.excused ? 'E' : 'F') : g ? gradeLabel(g) : '·';
        const color = absent ? (att.excused ? colors.green : colors.red) : g ? gradeColor(v) : '#c4bba6';
        return (
          <div key={key} style={{ ...td({ background: colors.cream, color, ...GRADE_TYPE_SCALE.single, fontWeight: absent ? 700 : GRADE_TYPE_SCALE.single.fontWeight, borderRight: GRADE_SEP }), gridColumn, gridRow }}>
            <button onClick={() => onOpenLesson(l.lesson.id, s.id)} title="Zur Mitarbeit" style={{ display: 'block', width: '100%', font: 'inherit', color: 'inherit' }}>
              {label}
            </button>
          </div>
        );
      }
      if (l.kind === 'exam') {
        const g = gradeOf(l.work.grades, s.id);
        const v = num(g);
        return (
          <div key={key} style={{ ...td({ background: KIND_BG_LIGHT[l.examKind], color: g ? gradeColor(v) : '#c4bba6', ...GRADE_TYPE_SCALE.single, borderRight: GRADE_SEP }), gridColumn, gridRow }}>
            <button onClick={() => onOpenWork(l.work.id, s.id)} title="Zu den Schriftlichen Leistungen" style={{ display: 'block', width: '100%', font: 'inherit', color: 'inherit' }}>
              {g ? gradeLabel(g) : '·'}
            </button>
          </div>
        );
      }
      if (l.kind === 'mitAvg') {
        const mit = avgs.mitByQuarter.get(l.quarter.id);
        return (
          <div
            key={key}
            style={{
              ...td({ background: colors.mitBgStrong, color: mit.value == null ? '#c4bba6' : gradeColor(mit.value), ...GRADE_TYPE_SCALE.average, borderRight: `${FRAME.mit.border}px solid ${FRAME.mit.color}` }),
              gridColumn,
              gridRow,
            }}
          >
            {renderAvg(mit.value, mit.overridden, allowGradeOverride && avgCellClick(s.id, 'mitAvg', l.quarter.id, mit.grade), mit.grade, isAvgLocked(s.id, 'mitAvg', l.quarter.id))}
          </div>
        );
      }
      if (l.kind === 'schrAvg') {
        const schr = avgs.schrByQuarter.get(l.quarter.id);
        return (
          <div
            key={key}
            style={{
              ...td({ background: colors.schBgStrong, color: schr.value == null ? '#c4bba6' : gradeColor(schr.value), ...GRADE_TYPE_SCALE.average, borderRight: `${FRAME.schr.border}px solid ${FRAME.schr.color}` }),
              gridColumn,
              gridRow,
            }}
          >
            {renderAvg(schr.value, schr.overridden, allowGradeOverride && avgCellClick(s.id, 'schrAvg', l.quarter.id, schr.grade), schr.grade, isAvgLocked(s.id, 'schrAvg', l.quarter.id))}
          </div>
        );
      }
      if (l.kind === 'qNote') {
        const q = avgs.qNoteByQuarter.get(l.quarter.id);
        return (
          <div key={key} style={{ ...td({ background: colors.qBg, color: q.value == null ? '#c4bba6' : gradeColor(q.value), ...GRADE_TYPE_SCALE.summary, borderRight: `3px solid ${l.accent}` }), gridColumn, gridRow }}>
            {renderAvg(q.value, q.overridden, allowGradeOverride && avgCellClick(s.id, 'qNote', l.quarter.id, q.grade), q.grade, isAvgLocked(s.id, 'qNote', l.quarter.id))}
          </div>
        );
      }
      if (l.kind === 'hjNote') {
        const h = avgs.hjByHalf.get(l.half.id);
        return (
          <div
            key={key}
            style={{
              ...td({ background: colors.hBg, color: h.value == null ? '#c4bba6' : gradeColor(h.value), ...GRADE_TYPE_SCALE.summary, borderRight: `${FRAME.half.border}px solid ${FRAME.half.color}` }),
              gridColumn,
              gridRow,
            }}
          >
            {renderAvg(h.value, h.overridden, allowGradeOverride && avgCellClick(s.id, 'hjNote', l.half.id, h.grade), h.grade, isAvgLocked(s.id, 'hjNote', l.half.id))}
          </div>
        );
      }
      // zeugnis
      const z = avgs.zeugnis;
      return (
        <div
          key={key}
          style={{
            ...td({ background: colors.sidebarBg, color: '#fff', ...GRADE_TYPE_SCALE.summary, borderRight: `${FRAME.year.border}px solid ${FRAME.year.color}` }),
            gridColumn,
            gridRow,
            position: isMobile ? 'static' : 'sticky',
            right: isMobile ? undefined : 0,
            zIndex: 1,
          }}
        >
          {renderAvg(z.value, z.overridden, allowGradeOverride && avgCellClick(s.id, 'zeugnis', courseId, z.grade), z.grade, isAvgLocked(s.id, 'zeugnis', courseId))}
        </div>
      );
    });

    // `.ns-row` is `display:contents` (see global.css) -- its children
    // still lay out as direct grid items via their own gridColumn/gridRow,
    // but the wrapper lets a single, plain CSS `:hover` rule highlight the
    // whole logical row without any onMouseEnter/onMouseLeave React state
    // (and the whole-table re-render that used to cause on every row hover).
    return (
      <div className="ns-row" key={s.id}>
        {nameCell}
        {leafCells}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {allowGradeOverride && (
        <Popover open={overrideEdit != null} anchorRef={overrideAnchorRef} onClose={() => setOverrideEdit(null)} width={220}>
          <div style={{ background: '#fff', border: `1px solid ${colors.borderStrong}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.18)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>DURCHSCHNITT SETZEN</span>
              <button onClick={() => setOverrideEdit(null)} style={{ fontSize: 13, color: colors.muted }}>
                ✕
              </button>
            </div>
            {/* Only unlocked averages open this popover (a locked one shakes its
                top lock instead). Pick a grade to override; an empty pick resets
                it, since the backend treats an empty grade as "delete the
                override". Locking itself lives in the SPERRE row, not here. */}
            <SplitKeys value={overrideEdit?.grade ?? null} onChange={setOverrideGrade} />
            {overrideEdit?.grade && (
              <button
                onClick={() => setOverrideGrade(null)}
                style={{ padding: '8px 12px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontWeight: 500, color: colors.mutedStrong, background: colors.cream }}
              >
                Reset
              </button>
            )}
          </div>
        </Popover>
      )}

      <div className="scroll-panel" style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ width: 'max-content' }}>
          {/* Header grid: the frame/label/Sperre/Gewichtung rows. Sticky at
              the top so they stay pinned while the student rows below scroll
              under them -- vertically what the Name/Zeugnis columns do
              horizontally. A separate body grid follows, sharing the same
              fixed column template so the two stay column-aligned. */}
          <div style={{ display: 'grid', width: 'max-content', gridTemplateColumns, position: 'sticky', top: 0, zIndex: 4 }}>
            {/* The name column is self-explanatory from its own contents, so
                this otherwise-empty top-left cell carries the school year. */}
            <div
              style={{
                ...leafHeaderStyle({ background: '#efece5', borderRight: `2px solid ${NAME_BORDER_COLOR}` }),
                gridColumn: '1 / 2',
                gridRow: `${ROW.year} / ${ROW.lock}`,
                position: isMobile ? 'static' : 'sticky',
                left: 0,
                zIndex: 3,
              }}
            >
              {schoolYearLabel && (
                <span style={{ margin: 'auto', font: `500 26px ${fonts.serif}`, color: colors.tealDark, letterSpacing: '.02em' }}>{schoolYearLabel}</span>
              )}
            </div>
            <div
              style={{
                ...weightRowStyle({ background: '#efece5', justifyContent: 'flex-end', padding: '3px 8px', borderRight: `2px solid ${NAME_BORDER_COLOR}` }),
                gridColumn: '1 / 2',
                gridRow: `${ROW.lock} / ${ROW.weight}`,
                position: isMobile ? 'static' : 'sticky',
                left: 0,
                zIndex: 3,
              }}
            >
              <span style={{ font: `500 10px ${fonts.mono}`, color: colors.mutedStrong, letterSpacing: '.06em' }}>BEARBEITUNGSSPERRE</span>
            </div>
            <div
              style={{
                ...weightRowStyle({ background: '#efece5', justifyContent: 'flex-end', padding: '4px 8px 6px', borderRight: `2px solid ${NAME_BORDER_COLOR}` }),
                gridColumn: '1 / 2',
                gridRow: `${ROW.weight} / ${BODY_START}`,
                position: isMobile ? 'static' : 'sticky',
                left: 0,
                zIndex: 3,
              }}
            >
              <span style={{ font: `500 10px ${fonts.mono}`, color: colors.mutedStrong, letterSpacing: '.06em' }}>GEWICHTUNG</span>
            </div>

            {groups.map(renderGroup)}
            {leaves.map(renderLeafHeader)}
            {leaves.map(renderLockCell)}
            {leaves.map(renderWeightCell)}
          </div>

          <div style={{ display: 'grid', width: 'max-content', gridTemplateColumns }}>
            {students.map(renderBodyRow)}

            {!students.length && (
              <div style={{ ...td({ justifyContent: 'flex-start' }), gridColumn: `1 / ${totalCols + 1}`, gridRow: '1 / 2' }}>Noch niemand eingeschrieben.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
