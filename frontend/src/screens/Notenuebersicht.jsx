import { useLayoutEffect, useRef, useState } from 'react';
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
  wrapLabel,
  GRADE_TYPE_SCALE,
  WRITTEN_WORK_KINDS,
  WRITTEN_WORK_GROUP,
  mitarbeitAverage,
  schriftlichAverage,
  resolveAverage,
} from '../lib/gradeMath.js';
import { formatShortDate, formatDateRange } from '../lib/dates.js';
import { usePersisted } from '../lib/usePersisted.js';
import { useViewport } from '../lib/useViewport.js';
import WeightInput from '../components/WeightInput.jsx';
import SplitKeys from '../components/SplitKeys.jsx';
import Popover from '../components/Popover.jsx';

// Klassenarbeiten sit in the KLASSENARBEITEN (amber) frame; Tests and
// Sonstige Leistungen count toward MITARBEIT, so they get a tint from that
// (teal) family instead — same hue as mitBgStrong/Ø MIT., one step lighter
// per kind.
const KIND_BG = { klassenarbeit: '#fdf7e9', test: '#e6f0ea', sonstige: '#d9ebe1' };
// Much paler than KIND_BG: individual exam grades sit a visual step below
// the kind sub-header, which itself sits a step below its frame's own
// strong header/average color — three tiers of the same hue family.
const KIND_BG_LIGHT = { klassenarbeit: '#fefcf5', test: '#f3f8f5', sonstige: '#eef6f1' };
const KIND_TEXT = { klassenarbeit: colors.gold, test: colors.teal, sonstige: colors.teal };
const SECTION_LABELS = { klassenarbeit: 'Klassenarbeiten', test: 'Tests', sonstige: 'Sonst. Leist.' };

// Escalating border thickness = escalating nesting depth (outside -> inside):
// year > half > quarter > mitarbeit/schriftlich. Each frame's own header row
// gets a matching top border, each frame's own average column a matching
// right border, so the two together read as one continuous "L" outline.
const FRAME = {
  year: { border: 5, color: colors.sidebarBg },
  half: { border: 4, color: colors.tealDark },
  mit: { border: 2, color: colors.teal },
  schr: { border: 2, color: '#a9791f' },
};

// No single data/average column should be wider than any other — capped at
// the widest of them, N.Q-Note, so a long written-work title can't drag its
// own column (and with it, the whole table) wider than the rest.
const COL_MAX_WIDTH = 44;

// The name column's own right edge — a clearly visible line the names sit
// behind, distinct from every frame's more subtle internal dividers. This is
// a real positioned element rather than a plain CSS border: the name column
// is sticky (position: sticky; left: 0) so it can stay in view while
// scrolling, and a sticky cell's *border* — like its background, per the
// stickyMask cells below — isn't reliably repainted on every scroll frame
// under border-collapse, so a `borderRight` here would flicker in and out
// while scrolling instead of just sitting there.
const NAME_BORDER_WIDTH = 2;
const NAME_BORDER_COLOR = colors.tealDark;
const NameRightEdge = () => <span style={{ position: 'absolute', top: -2, bottom: -2, right: 0, width: NAME_BORDER_WIDTH, background: NAME_BORDER_COLOR }} />;

// Every frame label row (GANZES SCHULJAHR, HALBJAHR, QUARTAL, MITARBEIT,
// KLASSENARBEITEN) already draws its own colored top border (or, for the
// outermost year frame, a solid background) to connect into whatever it
// nests around next. th()'s neutral 1px borderBottom would otherwise leave
// a thin, differently-colored hairline wedged between that label and its
// own border below it — killing borderBottom here lets the two meet with
// no seam in between. overflow/textOverflow already come from th()'s own
// default now, so this only needs the properties that are actually
// different here.
const FRAME_HEADER_BASE = { position: 'relative', paddingBottom: 13, borderBottom: 'none' };

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
      {collapsed ? '▾' : '◀'}
    </button>
  );
}

export default function Notenuebersicht({ bundle, onOpenStudent, onOpenLesson, onOpenWork, allowGradeOverride }) {
  // Schueleransicht embeds this component with a bundle.course.id swapped
  // for a synthetic one (so its collapse/scope preferences below don't leak
  // into the real course-wide Notenübersicht) — realCourseId is the actual
  // id grade-override API calls need to hit.
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
  // editable button (only in the Schueleransicht) — a manual override always
  // gets the little pencil badge, everywhere it's shown.
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

  const scope = 'year';
  // On a phone-width screen, pinning the name column on the left *and*
  // HJ-Note/Zeugnis on the right leaves barely any width for the
  // scrollable quarter data sandwiched between them — often none at all,
  // since both sticky edges alone can exceed the viewport (tablet and up
  // have enough room for both, so this only kicks in below that). Those
  // right-hand columns fall back to normal scrolling instead, the same as
  // everything else in the middle; only the name column stays pinned,
  // exactly like Stundenerfassung's and Schriftliche Leistungen' own
  // single-sided sticky roster column.
  const { isMobile } = useViewport();
  const [collapsed, setCollapsed] = usePersisted(`notenuebersicht:${bundle.course.id}:collapsed`, {
    year: false,
    half: {},
    quarter: {},
    mit: {},
    schr: {},
  });
  // Row/column highlight is a placeholder (per product decision, real design
  // exploration deferred): a full-row hover highlight only, since aligning a
  // per-column highlight across the multi-row header would need every header
  // row and every body row to share one column index, which the current
  // rowSpan-based header layout doesn't provide for free.
  const [hoverRow, setHoverRow] = useState(null);

  const toggleYear = () => setCollapsed((c) => ({ ...c, year: !c.year }));
  const toggleHalf = (id) => setCollapsed((c) => ({ ...c, half: { ...c.half, [id]: !c.half[id] } }));
  const toggleQuarter = (id) => setCollapsed((c) => ({ ...c, quarter: { ...c.quarter, [id]: !c.quarter[id] } }));
  const toggleMit = (qid) => setCollapsed((c) => ({ ...c, mit: { ...c.mit, [qid]: !c.mit[qid] } }));
  const toggleSchr = (qid) => setCollapsed((c) => ({ ...c, schr: { ...c.schr, [qid]: !c.schr[qid] } }));

  const halves = [...bundle.halves].sort((a, b) => a.idx - b.idx);
  const quarters = [...bundle.quarters].sort((a, b) => a.idx - b.idx);
  const students = sortStudents(bundle.students);

  const visibleHalfIdx = scope === 'h1' ? [1] : scope === 'h2' ? [2] : [1, 2];
  const visHalves = halves.filter((h) => visibleHalfIdx.includes(h.idx));
  const quartersByHalf = (half) => quarters.filter((q) => q.half_id === half.id);

  const setQuarterWeight = (quarter, field) => (e) => api.updateQuarter(quarter.id, { [field]: parseWeight(e.target.value) });
  const setHalfWeight = (half) => (e) => api.updateHalf(half.id, { weight: parseWeight(e.target.value) });

  // --- computation helpers (always run regardless of collapse — collapsing
  // only hides display cells, roll-up math still needs every value) ---
  const gradeOf = (list, studentId) => list.find((x) => x.student_id === studentId)?.grade || null;
  function qNoteFor(studentId, quarter, mitAvg, schrAvg) {
    return wavg([[mitAvg, quarter.weight_mitarbeit], [schrAvg, quarter.weight_schriftlich]]);
  }

  // Per-quarter display columns: mitAvg/schrAvg are always included (they're
  // the mitarbeit/schriftlich frame's own average column, hidden only if the
  // *quarter* itself is collapsed), lessons/exams only if that block isn't
  // collapsed and the global show/hide toggle is on. Tests and Sonstige
  // Leistungen count toward Mitarbeit (see WRITTEN_WORK_GROUP), so their
  // columns sit alongside the lessons, before Ø MIT.; only Klassenarbeiten
  // sit in the KLASSENARBEITEN block, before Ø SCHR.
  function buildQuarterCols(quarter) {
    const mitCollapsed = !!collapsed.mit[quarter.id];
    const schrCollapsed = !!collapsed.schr[quarter.id];
    // A lesson nobody has been graded in yet would just be an empty column
    // on the overview — leave it off until at least one grade is entered
    // (the wavg() calls below already ignore ungraded lessons either way, so
    // filtering here doesn't change any average).
    const qLessonsAll = bundle.lessons
      .filter((l) => l.quarter_id === quarter.id && l.grades.some((g) => g.grade))
      .sort((a, b) => a.date.localeCompare(b.date));
    const kindGroupsAll = WRITTEN_WORK_KINDS.map((k) => ({
      kind: k.value,
      works: bundle.writtenWorks.filter((w) => w.quarter_id === quarter.id && w.kind === k.value).sort((a, b) => a.date.localeCompare(b.date)),
    }));
    const mitKindGroupsAll = kindGroupsAll.filter((g) => WRITTEN_WORK_GROUP[g.kind] === 'mitarbeit');
    const schrKindGroupsAll = kindGroupsAll.filter((g) => WRITTEN_WORK_GROUP[g.kind] === 'schriftlich');
    const mitWorksAll = mitKindGroupsAll.flatMap((g) => g.works);
    const schrWorksAll = schrKindGroupsAll.flatMap((g) => g.works);

    const cols = [];
    if (!mitCollapsed) qLessonsAll.forEach((lesson) => cols.push({ kind: 'lesson', lesson }));
    if (!mitCollapsed) {
      mitKindGroupsAll.forEach((g) => g.works.forEach((work) => cols.push({ kind: 'exam', work, examKind: g.kind })));
    }
    cols.push({ kind: 'mitAvg', lessons: qLessonsAll, works: mitWorksAll });
    if (!schrCollapsed) {
      schrKindGroupsAll.forEach((g) => g.works.forEach((work) => cols.push({ kind: 'exam', work, examKind: g.kind })));
    }
    cols.push({ kind: 'schrAvg', works: schrWorksAll });

    return { quarter, mitCollapsed, schrCollapsed, cols, qLessonsAll, mitWorksAll, schrWorksAll };
  }

  // Bottom-up width computation: each level's width folds in its children's
  // (already collapse-aware) widths plus its own +1 for its average column.
  const halfColumns = visHalves.map((half) => {
    const hCollapsed = !!collapsed.half[half.id];
    const quarterCols = quartersByHalf(half).map((quarter) => {
      const qc = buildQuarterCols(quarter);
      const qCollapsed = !!collapsed.quarter[quarter.id];
      // +1 for the quarter's own Q-Note column, same reasoning as halfWidth's +1 below.
      return { ...qc, qCollapsed, width: qCollapsed ? 1 : qc.cols.length + 1 };
    });
    const innerWidth = quarterCols.reduce((a, qc) => a + qc.width, 0);
    const halfWidth = hCollapsed ? 1 : innerWidth + 1;
    return { half, hCollapsed, quarterCols, halfWidth };
  });
  const yearInnerWidth = halfColumns.reduce((a, hc) => a + hc.halfWidth, 0);

  // Every half's own HJ-Note is pinned to the right edge — not just the
  // current half's — each parked immediately to the left of whatever is
  // already pinned there (a later half's HJ-Note, then Zeugnis in year
  // scope). Native position:sticky already does the "don't move until you'd
  // be covered" behavior on its own: a half's HJ-Note only actually sticks
  // once ordinary scrolling would carry it past its own right-offset, i.e.
  // exactly the point it would otherwise slide under whatever's already
  // sitting there. So 1.HJ-Note only stops moving once 2.HJ-Note (pinned
  // right of it) would start to cover it — never earlier.
  //
  // The offset for each half is the *rendered* width of every later half's
  // own HJ-Note column plus Zeugnis's, not their nominal column widths —
  // labels, fonts, and zoom all shift real width away from nominal, so the
  // only reliable source is measuring the actual header cells and
  // recomputing on every render and on resize.
  const hjNoteHeaderRefs = useRef({});
  const zeugnisHeaderRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const [halfRightOffsets, setHalfRightOffsets] = useState({});

  // This effect has no dependency array (it needs to re-measure after every
  // render, same as the layout it's tracking), so the state update below
  // must bail out itself once the numbers actually settle — a fresh object
  // every time, even with identical values, would otherwise re-render
  // forever.
  const sameOffsets = (a, b) => {
    const keysA = Object.keys(a);
    return keysA.length === Object.keys(b).length && keysA.every((k) => a[k] === b[k]);
  };

  useLayoutEffect(() => {
    const measure = () => {
      if (collapsed.year) {
        setHalfRightOffsets((cur) => (sameOffsets(cur, {}) ? cur : {}));
        return;
      }
      let running = scope === 'year' ? zeugnisHeaderRef.current?.getBoundingClientRect().width ?? 0 : 0;
      const next = {};
      for (let i = halfColumns.length - 1; i >= 0; i -= 1) {
        const { half } = halfColumns[i];
        next[half.id] = running;
        running += hjNoteHeaderRefs.current[half.id]?.getBoundingClientRect().width ?? 0;
      }
      setHalfRightOffsets((cur) => (sameOffsets(cur, next) ? cur : next));
    };

    measure();

    const observedEls = [...halfColumns.map(({ half }) => hjNoteHeaderRefs.current[half.id]), zeugnisHeaderRef.current].filter(Boolean);
    if (!resizeObserverRef.current) resizeObserverRef.current = new ResizeObserver(measure);
    resizeObserverRef.current.disconnect();
    observedEls.forEach((el) => resizeObserverRef.current.observe(el));

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  useLayoutEffect(() => () => resizeObserverRef.current?.disconnect(), []);

  // overflow/textOverflow here mean wrapLabel's one explicit break is the
  // *only* break a header ever gets: with white-space staying 'pre' (so it
  // still honors that one \n and nothing else), any line that's still too
  // wide for its column — long words, a long single-line label — gets
  // clipped with an ellipsis instead of spilling into neighboring columns.
  // The handful of cells with their own negative-offset overlay (stickyMask,
  // NameRightEdge) that need to paint outside their own box override this
  // back to 'visible'.
  const th = (extra) => ({
    padding: '5px 6px',
    borderRight: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    font: `500 8.5px ${fonts.mono}`,
    color: colors.mutedStrong,
    letterSpacing: '.06em',
    textAlign: 'center',
    verticalAlign: 'middle',
    whiteSpace: 'pre',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    ...extra,
  });
  const td = (extra) => ({
    padding: '6px 6px',
    borderRight: `1px solid ${colors.divider}`,
    borderBottom: `1px solid ${colors.divider}`,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    ...extra,
  });
  const frameTh = (extra) => th({ ...FRAME_HEADER_BASE, ...extra });

  // --- header rows ---
  // r0: outermost year frame (only meaningful in Schuljahr scope).
  // r1: name + half frames (+ Zeugnis, year's own average column).
  // r2: quarter frames (+ HJ-Note, half's own average column).
  // r3: Mitarbeit/Klassenarbeiten frames (+ Q-Note, quarter's own average column).
  // r3b: written-work kind groups + lesson dates/Ø MIT/Ø SCHR (these three
  //      have no sub-grouping of their own, so they anchor here and span
  //      down through r4 instead of duplicating a row).
  // r4: individual written-work titles (one level below their kind group).
  const r0 = [];
  const r1 = [{ label: 'SCHÜLER:IN', rowSpan: scope === 'year' ? 6 : 5, colKey: 'name', style: th({ textAlign: 'left', minWidth: 190, background: '#efece5', position: 'sticky', left: 0, zIndex: 3, overflow: 'visible' }) }];
  const r2 = [];
  const r3 = [];
  const r3b = [];
  const r4 = [];

  if (scope === 'year') {
    // r0 is the only cell in its row — unlike every frame below it, it has
    // no separate SCHÜLER:IN entry of its own to cover that column, so its
    // span has to include both that leftmost column *and* the year's own
    // average column (Zeugnis) at the right, or the row falls one column
    // short and leaves a gap over Zeugnis where the year frame's dark
    // background should continue. Collapsed, the body shrinks to just
    // SCHÜLER:IN + Zeugnis (2 columns), so the same reasoning caps out at 2
    // instead of 1.
    r0.push({
      label: 'GANZES SCHULJAHR',
      colSpan: collapsed.year ? 2 : yearInnerWidth + 2,
      arrow: { collapsed: collapsed.year, onClick: toggleYear, dark: true },
      style: frameTh({ background: colors.sidebarBg, color: '#fff', fontWeight: 700 }),
    });
  }

  if (!collapsed.year) {
    halfColumns.forEach(({ half, hCollapsed, quarterCols }) => {
      r1.push({
        label: `${half.idx}. HALBJAHR`,
        colSpan: hCollapsed ? 1 : quarterCols.reduce((a, qc) => a + qc.width, 0) + 1,
        arrow: { collapsed: hCollapsed, onClick: () => toggleHalf(half.id) },
        style: frameTh({
          background: colors.hBg,
          color: colors.tealDark,
          fontWeight: 700,
          borderTop: `${FRAME.half.border}px solid ${FRAME.half.color}`,
          borderLeft: `${FRAME.half.border}px solid ${FRAME.half.color}`,
          // Matches HJ-Note's own borderRight below (same color/thickness) so
          // the top border doesn't dead-end above it — without this, the
          // frame's right edge would only start one row down, at HJ-Note
          // itself, leaving the top-right corner open instead of closed.
          borderRight: `${FRAME.half.border}px solid ${FRAME.half.color}`,
        }),
      });

      if (!hCollapsed) {
        quarterCols.forEach(({ quarter, qCollapsed, cols, width }) => {
          const accent = QUARTER_ACCENTS[(quarter.idx - 1) % QUARTER_ACCENTS.length];
          r2.push({
            label: wrapLabel(`${quarter.idx}. Quartal · ${formatDateRange(quarter.start_date, quarter.end_date)}`),
            colSpan: qCollapsed ? 1 : width,
            arrow: { collapsed: qCollapsed, onClick: () => toggleQuarter(quarter.id) },
            style: frameTh({
              background: colors.qBg,
              fontWeight: 600,
              borderTop: `3px solid ${accent}`,
              borderRight: `3px solid ${accent}`,
            }),
          });

          if (!qCollapsed) {
            const mitCollapsed = !!collapsed.mit[quarter.id];
            const schrCollapsed = !!collapsed.schr[quarter.id];
            const lessonCount = cols.filter((c) => c.kind === 'lesson').length;
            const mitExamCount = cols.filter((c) => c.kind === 'exam' && WRITTEN_WORK_GROUP[c.examKind] === 'mitarbeit').length;
            const schrExamCount = cols.filter((c) => c.kind === 'exam' && WRITTEN_WORK_GROUP[c.examKind] === 'schriftlich').length;
            r3.push({
              label: 'MITARBEIT',
              colSpan: lessonCount + mitExamCount + 1,
              arrow: { collapsed: mitCollapsed, onClick: () => toggleMit(quarter.id) },
              // borderRight matches Ø MIT.'s own borderRight (same
              // color/thickness) one row down, so the frame's right edge
              // runs unbroken from this header straight through to the
              // average column instead of only starting below it.
              style: frameTh({ background: colors.mitBgStrong, borderTop: `${FRAME.mit.border}px solid ${FRAME.mit.color}`, borderRight: `${FRAME.mit.border}px solid ${FRAME.mit.color}` }),
            });
            r3.push({
              label: 'KLASSENARBEITEN',
              colSpan: schrExamCount + 1,
              arrow: { collapsed: schrCollapsed, onClick: () => toggleSchr(quarter.id) },
              // Same reasoning as MITARBEIT above, matching Ø SCHR.'s border.
              style: frameTh({ background: colors.schBgStrong, borderTop: `${FRAME.schr.border}px solid ${FRAME.schr.color}`, borderRight: `${FRAME.schr.border}px solid ${FRAME.schr.color}` }),
            });

            let i = 0;
            while (i < cols.length) {
              const c = cols[i];
              if (c.kind === 'lesson') {
                const { dow, label } = formatShortDate(c.lesson.date);
                r3b.push({
                  label: `${dow}\n${label}`,
                  rowSpan: 2,
                  weight: { value: c.lesson.weight, onChange: (e) => api.updateLesson(c.lesson.id, { weight: parseWeight(e.target.value) }) },
                  style: th({ background: colors.mitBgStrong, width: 36 }),
                });
                i += 1;
              } else if (c.kind === 'mitAvg') {
                r3b.push({
                  label: 'Ø MIT.',
                  rowSpan: 2,
                  weight: { value: quarter.weight_mitarbeit, onChange: setQuarterWeight(quarter, 'weightMitarbeit') },
                  style: th({ background: colors.mitBgStrong, width: 40, color: colors.teal, fontWeight: 600, borderRight: `${FRAME.mit.border}px solid ${FRAME.mit.color}` }),
                });
                i += 1;
              } else if (c.kind === 'exam') {
                const kind = c.examKind;
                let j = i;
                while (j < cols.length && cols[j].kind === 'exam' && cols[j].examKind === kind) j += 1;
                const count = j - i;
                // A title can be arbitrarily long — capping the column at
                // COL_MAX_WIDTH (matching every other column, including the
                // quarter's own N.Q-Note) keeps a long one from dragging it
                // wider than the rest; wrapLabel's own single break plus
                // th()'s overflow/ellipsis (not more wrapping) handle
                // whatever doesn't fit after that.
                const titleStyle = { width: COL_MAX_WIDTH, maxWidth: COL_MAX_WIDTH };
                if (kind === 'klassenarbeit') {
                  // Klassenarbeiten are the only kind in this frame (now
                  // labelled KLASSENARBEITEN itself), so a kind sub-header
                  // here would just repeat that label — anchor each title
                  // directly, the same way lessons/Ø MIT./Ø SCHR. do.
                  for (let k = i; k < j; k += 1) {
                    const work = cols[k].work;
                    r3b.push({
                      label: wrapLabel(work.title.length > 16 ? `${work.title.slice(0, 15)}…` : work.title),
                      rowSpan: 2,
                      weight: { value: work.weight, onChange: (e) => api.updateWrittenWork(work.id, { weight: parseWeight(e.target.value) }) },
                      style: th({ background: KIND_BG[kind], color: KIND_TEXT[kind], ...titleStyle }),
                    });
                  }
                } else {
                  // Tests and Sonstige Leistungen share the MITARBEIT frame
                  // with lessons, so each kind-group still needs its own
                  // label — separated from its neighbors by a plain neutral
                  // divider, kept off the data columns in between.
                  const groupEdge = { borderLeft: `2px solid ${colors.borderStrong}` };
                  r3b.push({
                    label: wrapLabel(SECTION_LABELS[kind]),
                    colSpan: count,
                    // Unlike every other header, this one's allowed to break
                    // mid-word (not just at wrapLabel's own word-boundary
                    // break) instead of ellipsis-truncating — the group label
                    // sits above a whole block of narrow columns, so there's
                    // no single column width to truncate against.
                    style: th({ background: KIND_BG[kind], color: KIND_TEXT[kind], fontWeight: 600, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'visible', ...groupEdge }),
                  });
                  for (let k = i; k < j; k += 1) {
                    const work = cols[k].work;
                    r4.push({
                      label: wrapLabel(work.title.length > 16 ? `${work.title.slice(0, 15)}…` : work.title),
                      weight: { value: work.weight, onChange: (e) => api.updateWrittenWork(work.id, { weight: parseWeight(e.target.value) }) },
                      style: th({ background: KIND_BG[kind], color: KIND_TEXT[kind], ...titleStyle, ...(k === i && groupEdge) }),
                    });
                  }
                }
                i = j;
              } else if (c.kind === 'schrAvg') {
                r3b.push({
                  label: 'Ø SCHR.',
                  rowSpan: 2,
                  weight: { value: quarter.weight_schriftlich, onChange: setQuarterWeight(quarter, 'weightSchriftlich') },
                  style: th({ background: colors.schBgStrong, width: 40, color: colors.gold, fontWeight: 600, borderRight: `${FRAME.schr.border}px solid ${FRAME.schr.color}` }),
                });
                i += 1;
              }
            }
          }

          // Q-Note is this quarter's own average column, so it must come
          // after (to the right of) everything it's computed from — pushed
          // here, once the quarter's children are already in r3/r3b/r4,
          // matching the body row's push order exactly.
          r3.push({
            label: `${quarter.idx}.Q-Note`,
            rowSpan: 3,
            weight: { value: quarter.weight_quarter, onChange: setQuarterWeight(quarter, 'weightQuarter') },
            style: th({ background: colors.qBg, width: COL_MAX_WIDTH, color: colors.teal, fontWeight: 700, borderRight: `3px solid ${accent}` }),
          });
        });
      }

      // Same reasoning as Q-Note above: HJ-Note is half's own average,
      // pushed after all of this half's quarters.
      r2.push({
        label: `${half.idx}.HJ-Note`,
        rowSpan: 4,
        weight: { value: half.weight, onChange: setHalfWeight(half) },
        stickyMask: colors.hBg,
        ref: (el) => {
          hjNoteHeaderRefs.current[half.id] = el;
        },
        style: th({
          background: colors.hBg,
          width: COL_MAX_WIDTH,
          color: colors.tealDark,
          fontWeight: 700,
          borderRight: `${FRAME.half.border}px solid ${FRAME.half.color}`,
          position: isMobile ? 'static' : 'sticky',
          right: isMobile ? undefined : halfRightOffsets[half.id] ?? 0,
          zIndex: 2,
          overflow: 'visible',
        }),
      });
    });
  }

  if (scope === 'year') {
    // And Zeugnis is year's own average, pushed after both halves.
    r1.push({
      label: 'ZEUGNIS',
      rowSpan: 5,
      ref: zeugnisHeaderRef,
      stickyMask: colors.sidebarBg,
      style: th({
        background: colors.sidebarBg,
        color: '#fff',
        width: COL_MAX_WIDTH,
        borderRight: `${FRAME.year.border}px solid ${FRAME.year.color}`,
        position: isMobile ? 'static' : 'sticky',
        right: isMobile ? undefined : 0,
        zIndex: 2,
        overflow: 'visible',
      }),
    });
  }

  // --- body rows ---
  const bodyRows = students.map((s, i) => {
    const cells = [
      {
        key: 'name',
        content: (
          <>
            <NameRightEdge />
            <button onClick={() => onOpenStudent(s.id, 'matrix')} style={{ textAlign: 'left', fontWeight: 500, fontSize: 13 }}>
              {i + 1}. {studentDisplayName(s)}
              {studentKlasseLabel(s) && <span style={{ marginLeft: 6, fontWeight: 500, fontSize: 10.5, color: colors.muted }}>{studentKlasseLabel(s)}</span>}
            </button>
          </>
        ),
        style: td({ textAlign: 'left', background: i % 2 ? colors.cream : '#fff', position: 'sticky', left: 0, zIndex: 1 }),
      },
    ];

    const halfVals = [];
    halfColumns.forEach(({ half, hCollapsed, quarterCols }) => {
      const qVals = [];
      quarterCols.forEach(({ quarter, qCollapsed, cols }) => {
        const accent = QUARTER_ACCENTS[(quarter.idx - 1) % QUARTER_ACCENTS.length];
        const mitAvgCol = cols.find((c) => c.kind === 'mitAvg');
        const mit = resolveAverage(overrides, s.id, 'mitAvg', quarter.id, mitarbeitAverage(s.id, mitAvgCol.lessons, mitAvgCol.works));
        const schr = resolveAverage(overrides, s.id, 'schrAvg', quarter.id, schriftlichAverage(s.id, cols.find((c) => c.kind === 'schrAvg').works));
        const mitAvg = mit.value;
        const schrAvg = schr.value;
        const q = resolveAverage(overrides, s.id, 'qNote', quarter.id, qNoteFor(s.id, quarter, mitAvg, schrAvg));
        const qn = q.value;
        qVals.push([qn, quarter.weight_quarter]);

        if (!collapsed.year && !hCollapsed && !qCollapsed) {
          cols.forEach((c) => {
            if (c.kind === 'lesson') {
              const g = gradeOf(c.lesson.grades, s.id);
              const v = num(g);
              // An absence has no grade of its own — show who was missing and
              // whether it was excused right in the grade cell instead: a red
              // "F" for unentschuldigt, a green "E" for entschuldigt.
              const att = c.lesson.attendance.find((a) => a.student_id === s.id);
              const absent = att?.status === 'fehlt';
              const label = absent ? (att.excused ? 'E' : 'F') : g || '·';
              const color = absent ? (att.excused ? colors.green : colors.red) : g ? gradeColor(v) : '#c4bba6';
              cells.push({
                key: `l${c.lesson.id}`,
                content: (
                  <button onClick={() => onOpenLesson(c.lesson.id)} title="Zur Mündlichen Mitarbeit" style={{ display: 'block', width: '100%', font: 'inherit', color: 'inherit' }}>
                    {label}
                  </button>
                ),
                style: td({ background: colors.cream, color, ...GRADE_TYPE_SCALE.single, fontWeight: absent ? 700 : GRADE_TYPE_SCALE.single.fontWeight }),
              });
            } else if (c.kind === 'mitAvg') {
              cells.push({
                key: `mit${quarter.id}`,
                content: renderAvg(mitAvg, mit.overridden, allowGradeOverride && ((e) => openOverrideEdit(s.id, 'mitAvg', quarter.id, mit.grade, e.currentTarget))),
                style: td({ background: colors.mitBgStrong, color: mitAvg == null ? '#c4bba6' : gradeColor(mitAvg), ...GRADE_TYPE_SCALE.average, borderRight: `${FRAME.mit.border}px solid ${FRAME.mit.color}` }),
              });
            } else if (c.kind === 'exam') {
              const g = gradeOf(c.work.grades, s.id);
              const v = num(g);
              cells.push({
                key: `e${c.work.id}`,
                content: (
                  <button onClick={() => onOpenWork(c.work.id)} title="Zu den Schriftlichen Leistungen" style={{ display: 'block', width: '100%', font: 'inherit', color: 'inherit' }}>
                    {g || '·'}
                  </button>
                ),
                style: td({ background: KIND_BG_LIGHT[c.examKind], color: g ? gradeColor(v) : '#c4bba6', ...GRADE_TYPE_SCALE.single }),
              });
            } else if (c.kind === 'schrAvg') {
              cells.push({
                key: `schr${quarter.id}`,
                content: renderAvg(schrAvg, schr.overridden, allowGradeOverride && ((e) => openOverrideEdit(s.id, 'schrAvg', quarter.id, schr.grade, e.currentTarget))),
                style: td({ background: colors.schBgStrong, color: schrAvg == null ? '#c4bba6' : gradeColor(schrAvg), ...GRADE_TYPE_SCALE.average, borderRight: `${FRAME.schr.border}px solid ${FRAME.schr.color}` }),
              });
            }
          });
        }

        if (!collapsed.year && !hCollapsed) {
          cells.push({
            key: `q${quarter.id}`,
            content: renderAvg(qn, q.overridden, allowGradeOverride && ((e) => openOverrideEdit(s.id, 'qNote', quarter.id, q.grade, e.currentTarget))),
            style: td({ background: colors.qBg, color: qn == null ? '#c4bba6' : gradeColor(qn), ...GRADE_TYPE_SCALE.summary, borderRight: `3px solid ${accent}` }),
          });
        }
      });

      const h = resolveAverage(overrides, s.id, 'hjNote', half.id, wavg(qVals));
      const hn = h.value;
      halfVals.push([hn, half.weight]);
      if (!collapsed.year) {
        cells.push({
          key: `h${half.id}`,
          content: renderAvg(hn, h.overridden, allowGradeOverride && ((e) => openOverrideEdit(s.id, 'hjNote', half.id, h.grade, e.currentTarget))),
          style: td({
            background: colors.hBg,
            color: hn == null ? '#c4bba6' : gradeColor(hn),
            ...GRADE_TYPE_SCALE.summary,
            borderRight: `${FRAME.half.border}px solid ${FRAME.half.color}`,
            position: isMobile ? 'static' : 'sticky',
            right: isMobile ? undefined : halfRightOffsets[half.id] ?? 0,
            zIndex: 1,
          }),
        });
      }
    });

    if (scope === 'year') {
      const z = resolveAverage(overrides, s.id, 'zeugnis', courseId, wavg(halfVals));
      const zn = z.value;
      cells.push({
        key: 'zeugnis',
        content: renderAvg(zn, z.overridden, allowGradeOverride && ((e) => openOverrideEdit(s.id, 'zeugnis', courseId, z.grade, e.currentTarget))),
        style: td({ background: colors.sidebarBg, color: '#fff', ...GRADE_TYPE_SCALE.summary, borderRight: `${FRAME.year.border}px solid ${FRAME.year.color}`, position: isMobile ? 'static' : 'sticky', right: isMobile ? undefined : 0, zIndex: 1 }),
      });
    }

    return { student: s, cells };
  });

  const colCount = r4.length + r3b.length + 2;

  // Weight fields sit at the bottom of their (often row-spanning) header
  // cell, so every one of them — regardless of how many header rows its
  // column spans — lines up in the same strip directly above the first
  // student row instead of floating at whatever height vertical-centering
  // would otherwise land it at.
  const renderHeaderCell = (c, idx) => (
    <th key={idx} ref={c.ref} colSpan={c.colSpan} rowSpan={c.rowSpan} style={c.weight ? { ...c.style, verticalAlign: 'bottom', paddingBottom: 6 } : c.style}>
      {c.colKey === 'name' && <NameRightEdge />}
      {c.stickyMask && (
        // A sticky cell's box can land a subpixel off from its non-sticky
        // neighbors once the table's been scrolled, showing as a hairline
        // gap the whole length of its top and/or left edge. box-shadow can't
        // paper over this — table cells under border-collapse don't paint it
        // at all — so these are real, generously oversized elements in the
        // same color instead, one banding the full top edge and one the
        // full left edge.
        <>
          <span style={{ position: 'absolute', top: -4, left: -4, right: -4, height: 8, background: c.stickyMask }} />
          <span style={{ position: 'absolute', top: -4, left: -4, bottom: -4, width: 8, background: c.stickyMask }} />
        </>
      )}
      {c.arrow ? (
        // Arrow sits right next to the label, not pinned to the cell's own
        // far corner — for a wide colSpan (a half or the whole year) that
        // corner can land a column or more away from the label, right next
        // to whatever frame happens to follow (e.g. Zeugnis).
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {c.label}
          <CollapseArrow collapsed={c.arrow.collapsed} onClick={c.arrow.onClick} dark={c.arrow.dark} />
        </span>
      ) : (
        c.label
      )}
      {c.weight && <WeightInput value={c.weight.value} onChange={c.weight.onChange} />}
    </th>
  );

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
        <table style={{ borderCollapse: 'collapse' }} onMouseLeave={() => setHoverRow(null)}>
          <thead>
            {scope === 'year' && <tr>{r0.map(renderHeaderCell)}</tr>}
            <tr>{r1.map(renderHeaderCell)}</tr>
            <tr>{r2.map(renderHeaderCell)}</tr>
            <tr>{r3.map(renderHeaderCell)}</tr>
            <tr>{r3b.map(renderHeaderCell)}</tr>
            <tr>{r4.map(renderHeaderCell)}</tr>
          </thead>
          <tbody>
            {bodyRows.map(({ student, cells }, rowIdx) => (
              <tr key={student.id} onMouseEnter={() => setHoverRow(rowIdx)}>
                {cells.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      ...c.style,
                      boxShadow: [c.style.boxShadow, hoverRow === rowIdx && 'inset 0 0 0 999px rgba(15,91,82,.07)'].filter(Boolean).join(', ') || undefined,
                    }}
                  >
                    {c.content}
                  </td>
                ))}
              </tr>
            ))}
            {!students.length && (
              <tr>
                <td style={td({ textAlign: 'left' })} colSpan={colCount}>
                  Noch niemand eingeschrieben.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
