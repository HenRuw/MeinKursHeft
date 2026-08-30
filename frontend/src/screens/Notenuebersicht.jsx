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
  parseWeight,
  GRADE_TYPE_SCALE,
  WRITTEN_WORK_KINDS,
  WRITTEN_WORK_GROUP,
  mitarbeitAverage,
  schriftlichAverage,
  resolveAverage,
} from '../lib/gradeMath.js';
import { formatShortDate } from '../lib/dates.js';
import { usePersisted } from '../lib/usePersisted.js';
import { useViewport } from '../lib/useViewport.js';
import WeightInput from '../components/WeightInput.jsx';
import SplitKeys from '../components/SplitKeys.jsx';
import Popover from '../components/Popover.jsx';

// Klassenarbeiten sit in the KLASSENARBEITEN (amber) frame; Tests and
// Sonstige Leistungen count toward MITARBEIT, so they get a tint from that
// (teal) family instead.
const KIND_BG = { klassenarbeit: '#fdf7e9', test: '#e6f0ea', sonstige: '#d9ebe1' };
const KIND_BG_LIGHT = { klassenarbeit: '#fefcf5', test: '#f3f8f5', sonstige: '#eef6f1' };
const KIND_TEXT = { klassenarbeit: colors.gold, test: colors.teal, sonstige: colors.teal };
const SECTION_LABELS = { klassenarbeit: 'Klassenarbeiten', test: 'Tests', sonstige: 'Sonst. Leist.' };

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
const COL_WIDTH = { name: 190, lesson: 44, exam: 52, mitAvg: 48, schrAvg: 48, qNote: 52, hjNote: 52, zeugnis: 44 };
const NAME_BORDER_COLOR = colors.tealDark;

// Header grid rows, top to bottom; body rows start right after.
const ROW = { year: 1, half: 2, quarter: 3, mitSchr: 4, kindOrKlassen: 5, examTitle: 6 };
const HEADER_ROWS = 6;
const BODY_START = HEADER_ROWS + 1;

function CollapseArrow({ collapsed, onClick, dark }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={collapsed ? 'Aufklappen' : 'Einklappen'}
      style={{
        flex: 'none',
        width: 14,
        height: 14,
        borderRadius: 4,
        fontSize: 8,
        lineHeight: '14px',
        textAlign: 'center',
        color: dark ? '#fff' : '#3c4a46',
        background: dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.08)',
      }}
    >
      {collapsed ? '+' : '◀'}
    </button>
  );
}

// Builds the flat, collapse-aware column list the whole grid is laid out
// from: `leaves` is one entry per actual data/average column, in on-screen
// order (Name is always grid column 1 and handled separately, not a leaf).
// `groups` is one entry per collapsible frame header (year/half/quarter/
// mitarbeit/klassenarbeiten) plus the written-work kind sub-headers -- each
// just a {start, end} range over `leaves`, so its on-screen position is pure
// index arithmetic, never a DOM measurement.
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
              mitKindGroups.forEach((g) => {
                if (!g.works.length) return;
                const kindStart = leaves.length;
                g.works.forEach((work, idx) => leaves.push({ kind: 'exam', examKind: g.kind, width: COL_WIDTH.exam, work, quarter, firstInKind: idx === 0 }));
                groups.push({ key: `kind-${quarter.id}-${g.kind}`, level: 'kind', examKind: g.kind, label: SECTION_LABELS[g.kind], start: kindStart, end: leaves.length });
              });
            }
            leaves.push({ kind: 'mitAvg', width: COL_WIDTH.mitAvg, quarter });
            groups.push({ key: `mit-${quarter.id}`, level: 'mit', label: 'MITARBEIT', quarter, start: mitStart, end: leaves.length, collapsed: mitCollapsed, onToggle: () => toggles.mit(quarter.id) });

            const schrStart = leaves.length;
            if (!schrCollapsed) {
              // Klassenarbeiten are the only kind in this frame (now
              // labelled KLASSENARBEITEN itself), so each title is anchored
              // directly -- no separate kind sub-header, unlike Tests/
              // Sonstige above.
              schrKindGroups.forEach((g) => g.works.forEach((work) => leaves.push({ kind: 'exam', examKind: g.kind, width: COL_WIDTH.exam, work, quarter, direct: true })));
            }
            leaves.push({ kind: 'schrAvg', width: COL_WIDTH.schrAvg, quarter });
            groups.push({ key: `schr-${quarter.id}`, level: 'schr', label: 'KLASSENARBEITEN', quarter, start: schrStart, end: leaves.length, collapsed: schrCollapsed, onToggle: () => toggles.schr(quarter.id) });
          }
          leaves.push({ kind: 'qNote', width: COL_WIDTH.qNote, quarter, accent });
          groups.push({
            key: `quarter-${quarter.id}`,
            level: 'quarter',
            label: `${quarter.idx}. Quartal`,
            start: quarterStart,
            end: leaves.length,
            collapsed: qCollapsed,
            onToggle: () => toggles.quarter(quarter.id),
            accent,
          });
        });
      }
      leaves.push({ kind: 'hjNote', width: COL_WIDTH.hjNote, half });
      groups.push({ key: `half-${half.id}`, level: 'half', label: `${half.idx}. HALBJAHR`, start: halfStart, end: leaves.length, collapsed: hCollapsed, onToggle: () => toggles.half(half.id) });
    });
  }
  leaves.push({ kind: 'zeugnis', width: COL_WIDTH.zeugnis });
  // start:-1 makes this group's grid-column begin at column 1 (Name's own
  // column), not column 2 -- unlike every other frame, the year frame has no
  // separate Name cell of its own to cover that column in its header row, so
  // its background has to reach one column further left to avoid a gap.
  groups.push({ key: 'year', level: 'year', label: 'GANZES SCHULJAHR', start: -1, end: leaves.length, collapsed: collapsed.year, onToggle: toggles.year });

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

export default function Notenuebersicht({ bundle, onOpenStudent, onOpenLesson, onOpenWork, allowGradeOverride }) {
  // Schueleransicht embeds this component with a bundle.course.id swapped
  // for a synthetic one (so its collapse preferences below don't leak into
  // the real course-wide Notenübersicht) -- realCourseId is the actual id
  // grade-override API calls and the Zeugnis average need to hit.
  const courseId = bundle.realCourseId ?? bundle.course.id;
  const overrides = bundle.gradeOverrides || [];
  const [overrideEdit, setOverrideEdit] = useState(null); // { studentId, kind, refId, grade }
  const overrideAnchorRef = useRef(null);
  const openOverrideEdit = (studentId, kind, refId, grade, el) => {
    overrideAnchorRef.current = el;
    setOverrideEdit({ studentId, kind, refId, grade });
  };
  const setOverrideGrade = (grade) => {
    const { studentId, kind, refId } = overrideEdit;
    api.setGradeOverride(courseId, { studentId, kind, refId, grade });
    setOverrideEdit(null);
  };
  // Same content whether the cell is plain text (read elsewhere) or an
  // editable button (only in the Schueleransicht) -- a manual override
  // always gets the little pencil badge, everywhere it's shown.
  const renderAvg = (value, overridden, onClick) => {
    const inner = (
      <>
        {fmt(value)}
        {overridden && (
          <span title="Manuell eingetragen – nicht berechnet" style={{ marginLeft: 3, fontSize: 8 }}>
            ✎
          </span>
        )}
      </>
    );
    return onClick ? (
      <button onClick={onClick} style={{ display: 'block', width: '100%', font: 'inherit', color: 'inherit' }}>
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
  const { leaves, groups } = buildColumns(bundle, collapsed, toggles);

  const setQuarterWeight = (quarter, field) => (e) => api.updateQuarter(quarter.id, { [field]: parseWeight(e.target.value) });
  const setHalfWeight = (half) => (e) => api.updateHalf(half.id, { weight: parseWeight(e.target.value) });

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
    font: `500 8.5px ${fonts.mono}`,
    letterSpacing: '.06em',
    justifyContent: 'flex-start',
    textAlign: 'left',
  };
  // Leaf headers (individual columns): label + optional weight input,
  // bottom-anchored so every weight field -- regardless of how tall its own
  // column header is (Zeugnis spans far more rows than a lesson date) --
  // lines up in the same strip directly above the first student row.
  //
  // No `alignItems: 'center'` here (default is 'stretch'): the label span
  // has no width of its own, so stretching it to the full column width is
  // what lets it actually wrap within that width instead of shrink-wrapping
  // to its unbroken text size. WeightInput sets its own explicit width, so
  // it isn't affected by the stretch and still centers itself via its own
  // margin:auto. `overflow:hidden` stays only as a last-resort safety net --
  // the grid row itself grows to fit however many lines a label wraps to,
  // so it's normally never triggered.
  const leafHeaderStyle = (extra) => ({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    gap: 2,
    padding: '5px 4px 6px',
    font: `500 8.5px ${fonts.mono}`,
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

  // --- group (frame) header rendering ---
  const GROUP_ROW = { year: ROW.year, half: ROW.half, quarter: ROW.quarter, mit: ROW.mitSchr, schr: ROW.mitSchr, kind: ROW.kindOrKlassen };
  const GROUP_BG = { year: colors.sidebarBg, half: colors.hBg, quarter: colors.qBg, mit: colors.mitBgStrong, schr: colors.schBgStrong };
  const GROUP_COLOR = { year: '#fff', half: colors.tealDark, quarter: colors.mutedStrong, mit: colors.mutedStrong, schr: colors.mutedStrong };
  const GROUP_WEIGHT = { year: 700, half: 700, quarter: 600, mit: 500, schr: 500 };

  const renderGroup = (g) => {
    const row = GROUP_ROW[g.level];
    const gridColumn = `${colLine(g.start)} / ${colLine(g.end)}`;
    const gridRow = `${row} / ${row + 1}`;
    if (g.level === 'kind') {
      return (
        <div
          key={g.key}
          style={{
            ...groupBaseStyle,
            gridColumn,
            gridRow,
            background: KIND_BG[g.examKind],
            color: KIND_TEXT[g.examKind],
            fontWeight: 600,
            borderLeft: `2px solid ${colors.borderStrong}`,
            borderBottom: `1px solid ${colors.border}`,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          {g.label}
        </div>
      );
    }
    const borderColor = g.level === 'quarter' ? g.accent : FRAME[g.level].color;
    const borderWidth = g.level === 'quarter' ? 3 : FRAME[g.level].border;
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
          borderTop: `${borderWidth}px solid ${borderColor}`,
          borderRight: `${borderWidth}px solid ${borderColor}`,
          ...(g.level === 'half' ? { borderLeft: `${borderWidth}px solid ${borderColor}` } : null),
        }}
      >
        {/* Arrow *before* the label, not after: the label wraps onto
            further lines (below) rather than truncating once its frame is
            too narrow to fit it on one line, which would drag a trailing
            arrow sideways along with it. Leading the label instead pins the
            arrow at frameStart+padding -- a fixed offset that never depends
            on how the label ends up wrapping. */}
        <CollapseArrow collapsed={g.collapsed} onClick={g.onToggle} dark={g.level === 'year'} />
        {/* Half/Quarter/Mitarbeit/Klassenarbeiten shrink to just their own
            average column's width (~44-52px) -- whether from being manually
            collapsed, or simply because there's no lesson/exam data for
            them to show -- too narrow for the label to stay readable
            wrapped horizontally (word-break degenerates into one character
            per line at that width). The label must still be there next to
            the +, though, so it switches to vertical (reads top-to-bottom)
            instead of disappearing -- the row just grows taller to fit one
            upright line instead of wider. */}
        {g.end - g.start > 1 || g.level === 'year' ? (
          <span style={{ minWidth: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{g.label}</span>
        ) : (
          <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', whiteSpace: 'nowrap' }}>{g.label}</span>
        )}
      </div>
    );
  };

  // --- leaf header rendering ---
  const renderLeafHeader = (l, i) => {
    const gridColumn = `${colLine(i)} / ${colLine(i) + 1}`;
    if (l.kind === 'lesson') {
      const { dow, label } = formatShortDate(l.lesson.date);
      return (
        <div key={`l${i}`} style={leafHeaderStyle({ gridColumn, gridRow: `${ROW.kindOrKlassen} / ${BODY_START}`, background: colors.mitBgStrong })}>
          <span>{`${dow}\n${label}`}</span>
          <WeightInput value={l.lesson.weight} onChange={(e) => api.updateLesson(l.lesson.id, { weight: parseWeight(e.target.value) })} />
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
            gridRow: `${rowStart} / ${BODY_START}`,
            background: KIND_BG[l.examKind],
            color: KIND_TEXT[l.examKind],
            ...(l.firstInKind ? { borderLeft: `2px solid ${colors.borderStrong}` } : null),
          })}
        >
          <span>{l.work.title}</span>
          <WeightInput value={l.work.weight} onChange={(e) => api.updateWrittenWork(l.work.id, { weight: parseWeight(e.target.value) })} />
        </div>
      );
    }
    if (l.kind === 'mitAvg') {
      return (
        <div
          key={`ma${i}`}
          style={leafHeaderStyle({
            gridColumn,
            gridRow: `${ROW.kindOrKlassen} / ${BODY_START}`,
            background: colors.mitBgStrong,
            color: colors.teal,
            fontWeight: 600,
            borderRight: `${FRAME.mit.border}px solid ${FRAME.mit.color}`,
          })}
        >
          <span>Ø MIT.</span>
          <WeightInput value={l.quarter.weight_mitarbeit} onChange={setQuarterWeight(l.quarter, 'weightMitarbeit')} />
        </div>
      );
    }
    if (l.kind === 'schrAvg') {
      return (
        <div
          key={`sa${i}`}
          style={leafHeaderStyle({
            gridColumn,
            gridRow: `${ROW.kindOrKlassen} / ${BODY_START}`,
            background: colors.schBgStrong,
            color: colors.gold,
            fontWeight: 600,
            borderRight: `${FRAME.schr.border}px solid ${FRAME.schr.color}`,
          })}
        >
          <span>Ø SCHR.</span>
          <WeightInput value={l.quarter.weight_schriftlich} onChange={setQuarterWeight(l.quarter, 'weightSchriftlich')} />
        </div>
      );
    }
    if (l.kind === 'qNote') {
      return (
        <div
          key={`q${i}`}
          style={leafHeaderStyle({
            gridColumn,
            gridRow: `${ROW.mitSchr} / ${BODY_START}`,
            background: colors.qBg,
            color: colors.teal,
            fontWeight: 700,
            borderRight: `3px solid ${l.accent}`,
          })}
        >
          <span>{l.quarter.idx}.Q-Note</span>
          <WeightInput value={l.quarter.weight_quarter} onChange={setQuarterWeight(l.quarter, 'weightQuarter')} />
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
            gridRow: `${ROW.quarter} / ${BODY_START}`,
            background: colors.hBg,
            color: colors.tealDark,
            fontWeight: 700,
            borderRight: `${FRAME.half.border}px solid ${FRAME.half.color}`,
          })}
        >
          <span>{l.half.idx}.HJ-Note</span>
          <WeightInput value={l.half.weight} onChange={setHalfWeight(l.half)} />
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
          gridRow: `${ROW.half} / ${BODY_START}`,
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

  // --- body rendering ---
  const renderBodyRow = (s, rowIdx) => {
    const row = BODY_START + rowIdx;
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
        const label = absent ? (att.excused ? 'E' : 'F') : g || '·';
        const color = absent ? (att.excused ? colors.green : colors.red) : g ? gradeColor(v) : '#c4bba6';
        return (
          <div key={key} style={{ ...td({ background: colors.cream, color, ...GRADE_TYPE_SCALE.single, fontWeight: absent ? 700 : GRADE_TYPE_SCALE.single.fontWeight }), gridColumn, gridRow }}>
            <button onClick={() => onOpenLesson(l.lesson.id)} title="Zur Mündlichen Mitarbeit" style={{ display: 'block', width: '100%', font: 'inherit', color: 'inherit' }}>
              {label}
            </button>
          </div>
        );
      }
      if (l.kind === 'exam') {
        const g = gradeOf(l.work.grades, s.id);
        const v = num(g);
        return (
          <div key={key} style={{ ...td({ background: KIND_BG_LIGHT[l.examKind], color: g ? gradeColor(v) : '#c4bba6', ...GRADE_TYPE_SCALE.single }), gridColumn, gridRow }}>
            <button onClick={() => onOpenWork(l.work.id)} title="Zu den Schriftlichen Leistungen" style={{ display: 'block', width: '100%', font: 'inherit', color: 'inherit' }}>
              {g || '·'}
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
            {renderAvg(mit.value, mit.overridden, allowGradeOverride && ((e) => openOverrideEdit(s.id, 'mitAvg', l.quarter.id, mit.grade, e.currentTarget)))}
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
            {renderAvg(schr.value, schr.overridden, allowGradeOverride && ((e) => openOverrideEdit(s.id, 'schrAvg', l.quarter.id, schr.grade, e.currentTarget)))}
          </div>
        );
      }
      if (l.kind === 'qNote') {
        const q = avgs.qNoteByQuarter.get(l.quarter.id);
        return (
          <div key={key} style={{ ...td({ background: colors.qBg, color: q.value == null ? '#c4bba6' : gradeColor(q.value), ...GRADE_TYPE_SCALE.summary, borderRight: `3px solid ${l.accent}` }), gridColumn, gridRow }}>
            {renderAvg(q.value, q.overridden, allowGradeOverride && ((e) => openOverrideEdit(s.id, 'qNote', l.quarter.id, q.grade, e.currentTarget)))}
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
            {renderAvg(h.value, h.overridden, allowGradeOverride && ((e) => openOverrideEdit(s.id, 'hjNote', l.half.id, h.grade, e.currentTarget)))}
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
          {renderAvg(z.value, z.overridden, allowGradeOverride && ((e) => openOverrideEdit(s.id, 'zeugnis', courseId, z.grade, e.currentTarget)))}
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
              <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>NOTE MANUELL SETZEN</span>
              <button onClick={() => setOverrideEdit(null)} style={{ fontSize: 13, color: colors.muted }}>
                ✕
              </button>
            </div>
            <SplitKeys value={overrideEdit?.grade ?? null} onChange={setOverrideGrade} />
          </div>
        </Popover>
      )}

      <div className="scroll-panel" style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', width: 'max-content', gridTemplateColumns }}>
          <div
            style={{
              ...leafHeaderStyle({ background: '#efece5', alignItems: 'flex-start', textAlign: 'left', justifyContent: 'center', borderRight: `2px solid ${NAME_BORDER_COLOR}` }),
              gridColumn: '1 / 2',
              gridRow: `${ROW.half} / ${BODY_START}`,
              position: isMobile ? 'static' : 'sticky',
              left: 0,
              zIndex: 3,
            }}
          >
            SCHÜLER:IN
          </div>

          {groups.map(renderGroup)}
          {leaves.map(renderLeafHeader)}

          {students.map(renderBodyRow)}

          {!students.length && (
            <div style={{ ...td({ justifyContent: 'flex-start' }), gridColumn: `1 / ${totalCols + 1}`, gridRow: `${BODY_START} / ${BODY_START + 1}` }}>Noch niemand eingeschrieben.</div>
          )}
        </div>
      </div>
    </div>
  );
}
