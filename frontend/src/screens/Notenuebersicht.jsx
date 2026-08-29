import { useState } from 'react';
import { api } from '../api.js';
import { colors, fonts, QUARTER_ACCENTS } from '../theme.js';
import {
  sortStudents,
  studentDisplayName,
  num,
  fmt,
  wavg,
  gradeColor,
  parseWeight,
  wrapLabel,
  GRADE_TYPE_SCALE,
  WRITTEN_WORK_KINDS,
} from '../lib/gradeMath.js';
import { formatShortDate, formatDateRange, currentQuarter } from '../lib/dates.js';
import { usePersisted } from '../lib/usePersisted.js';
import WeightInput from '../components/WeightInput.jsx';

const KIND_BADGE = { klassenarbeit: 'KA', test: 'T', sonstige: 'SO' };
const KIND_BG = { klassenarbeit: '#fdf7e9', test: '#fbf0da', sonstige: '#f6ead0' };
// Much paler than KIND_BG: individual exam grades sit a visual step below
// the kind sub-header, which itself sits a step below the SCHRIFTLICH frame
// (schBgStrong) — three tiers of the same hue family.
const KIND_BG_LIGHT = { klassenarbeit: '#fefcf5', test: '#fdfaf2', sonstige: '#fcf7ec' };
const SECTION_LABELS = { klassenarbeit: 'Klassenarbeiten', test: 'Tests', sonstige: 'Sonstige Leistungen' };

const SCOPES = [
  ['year', 'Schuljahr'],
  ['h1', '1. Halbjahr'],
  ['h2', '2. Halbjahr'],
];

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

// A frame's left edge often lands on a grid line a sibling frame also wants
// to border (e.g. quarter 2 touching quarter 1, or SCHRIFTLICH touching
// MITARBEIT). Declaring that edge as a real `border-left` next to the
// neighbor's same-width `border-right` leaves the color border-collapse
// picks between the two up to the browser — which is exactly how a frame
// ends up "recolored" by its neighbor. An inset box-shadow paints entirely
// inside this cell's own box instead, so neighboring frames never contest
// it and every frame's outline stays its own single color all the way
// around (top + left via shadow + right via a real border).
const edgeShadow = (width, color) => ({ boxShadow: `inset ${width}px 0 0 ${color}` });

const FRAME_HEADER_BASE = { position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis', paddingBottom: 13 };

function CollapseArrow({ collapsed, onClick, dark }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={collapsed ? 'Aufklappen' : 'Einklappen'}
      style={{
        position: 'absolute',
        right: 3,
        bottom: 2,
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

export default function Notenuebersicht({ bundle, onOpenStudent }) {
  const [scope, setScope] = usePersisted(`notenuebersicht:${bundle.course.id}:scope`, 'year');
  const [showLessons, setShowLessons] = usePersisted(`notenuebersicht:${bundle.course.id}:showLessons`, true);
  const [showWrittenSingles, setShowWrittenSingles] = usePersisted(`notenuebersicht:${bundle.course.id}:showWrittenSingles`, true);
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
  const currentHalfId = currentQuarter(quarters)?.half_id ?? null;

  const visibleHalfIdx = scope === 'h1' ? [1] : scope === 'h2' ? [2] : [1, 2];
  const visHalves = halves.filter((h) => visibleHalfIdx.includes(h.idx));
  const quartersByHalf = (half) => quarters.filter((q) => q.half_id === half.id);

  const setQuarterWeight = (quarter, field) => (e) => api.updateQuarter(quarter.id, { [field]: parseWeight(e.target.value) });
  const setHalfWeight = (half) => (e) => api.updateHalf(half.id, { weight: parseWeight(e.target.value) });

  // --- computation helpers (always run regardless of collapse — collapsing
  // only hides display cells, roll-up math still needs every value) ---
  const gradeOf = (list, studentId) => list.find((x) => x.student_id === studentId)?.grade || null;
  function mitAvgFor(studentId, lessons) {
    const vals = lessons.map((l) => num(gradeOf(l.grades, studentId))).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  function schrAvgFor(studentId, works) {
    return wavg(works.map((w) => [num(gradeOf(w.grades, studentId)), w.weight]));
  }
  function qNoteFor(studentId, quarter, mitAvg, schrAvg) {
    return wavg([[mitAvg, quarter.weight_mitarbeit], [schrAvg, quarter.weight_schriftlich]]);
  }

  // Per-quarter display columns: mitAvg/schrAvg are always included (they're
  // the mitarbeit/schriftlich frame's own average column, hidden only if the
  // *quarter* itself is collapsed), lessons/exams only if that block isn't
  // collapsed and the global show/hide toggle is on.
  function buildQuarterCols(quarter) {
    const mitCollapsed = !!collapsed.mit[quarter.id];
    const schrCollapsed = !!collapsed.schr[quarter.id];
    const qLessonsAll = bundle.lessons.filter((l) => l.quarter_id === quarter.id).sort((a, b) => a.date.localeCompare(b.date));
    const kindGroupsAll = WRITTEN_WORK_KINDS.map((k) => ({
      kind: k.value,
      works: bundle.writtenWorks.filter((w) => w.quarter_id === quarter.id && w.kind === k.value).sort((a, b) => a.date.localeCompare(b.date)),
    }));
    const allWorksAll = kindGroupsAll.flatMap((g) => g.works);

    const cols = [];
    if (!mitCollapsed && showLessons) qLessonsAll.forEach((lesson) => cols.push({ kind: 'lesson', lesson }));
    cols.push({ kind: 'mitAvg', lessons: qLessonsAll });
    if (!schrCollapsed && showWrittenSingles) {
      kindGroupsAll.forEach((g) => g.works.forEach((work) => cols.push({ kind: 'exam', work, examKind: g.kind })));
    }
    cols.push({ kind: 'schrAvg', works: allWorksAll });

    // Every quarter's own left edge lands on its first column (a lesson, or
    // Ø MIT. if lessons are hidden); SCHRIFTLICH's own left edge lands on
    // its first column, which is Ø SCHR. itself whenever this quarter has
    // no exams to show. Both continue that frame's border down through the
    // header sub-rows and every student row — see edgeShadow above.
    cols[0].isQuarterEdge = true;
    cols[cols.findIndex((c) => c.kind === 'exam' || c.kind === 'schrAvg')].isSchrEdge = true;

    return { quarter, mitCollapsed, schrCollapsed, cols, qLessonsAll, allWorksAll };
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

  // Pixel-width math for pinning the current half's HJ-Note (and, in year
  // scope, the Zeugnis) column to the right edge while the rest of the
  // matrix scrolls underneath. Mirrors each column type's own width+padding
  // +border exactly as declared in td()/th() below, so the computed `right`
  // offset lines up with what's actually rendered.
  const PAD_H = 12; // 6px + 6px horizontal cell padding
  const quarterPxWidth = (qc) => {
    if (qc.qCollapsed) return PAD_H + 44 + 3; // just the Q-Note column (3px accent border)
    const lessonCount = qc.cols.filter((c) => c.kind === 'lesson').length;
    const examCount = qc.cols.filter((c) => c.kind === 'exam').length;
    return (
      lessonCount * (PAD_H + 28 + 1) +
      (PAD_H + 40 + FRAME.mit.border) + // Ø MIT.
      examCount * (PAD_H + 46 + 1) +
      (PAD_H + 40 + FRAME.schr.border) + // Ø SCHR.
      (PAD_H + 44 + 3) // Q-Note
    );
  };
  const halfPxWidth = (hc) => {
    const own = PAD_H + 48 + FRAME.half.border; // HJ-Note
    return hc.hCollapsed ? own : hc.quarterCols.reduce((a, qc) => a + quarterPxWidth(qc), 0) + own;
  };
  const ZEUGNIS_PX_WIDTH = PAD_H + 52 + FRAME.year.border;

  const currentHalfIdx = halfColumns.findIndex(({ half }) => half.id === currentHalfId);
  const currentHalfRight =
    !collapsed.year && currentHalfIdx !== -1
      ? halfColumns.slice(currentHalfIdx + 1).reduce((a, hc) => a + halfPxWidth(hc), 0) + (scope === 'year' ? ZEUGNIS_PX_WIDTH : 0)
      : 0;

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
  // r3: Mitarbeit/Schriftlich frames (+ Q-Note, quarter's own average column).
  // r3b: written-work kind groups + lesson dates/Ø MIT/Ø SCHR (these three
  //      have no sub-grouping of their own, so they anchor here and span
  //      down through r4 instead of duplicating a row).
  // r4: individual written-work titles (one level below their kind group).
  const r0 = [];
  const r1 = [{ label: 'SCHÜLER:IN', rowSpan: scope === 'year' ? 6 : 5, colKey: 'name', style: th({ textAlign: 'left', minWidth: 190, background: '#efece5', position: 'sticky', left: 0, zIndex: 3 }) }];
  const r2 = [];
  const r3 = [];
  const r3b = [];
  const r4 = [];

  if (scope === 'year') {
    r0.push({
      label: 'GANZES SCHULJAHR',
      colSpan: collapsed.year ? 1 : yearInnerWidth + 1,
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
              ...edgeShadow(3, accent),
            }),
          });

          if (!qCollapsed) {
            const mitCollapsed = !!collapsed.mit[quarter.id];
            const schrCollapsed = !!collapsed.schr[quarter.id];
            const lessonCount = cols.filter((c) => c.kind === 'lesson').length;
            const examCount = cols.filter((c) => c.kind === 'exam').length;
            r3.push({
              label: 'MITARBEIT',
              colSpan: lessonCount + 1,
              arrow: { collapsed: mitCollapsed, onClick: () => toggleMit(quarter.id) },
              // MITARBEIT always opens the quarter, so its own left edge IS
              // the quarter's left edge — continue the quarter's accent
              // border down onto this row rather than drawing MITARBEIT's
              // own (differently-colored) frame there.
              style: frameTh({ background: colors.mitBgStrong, borderTop: `${FRAME.mit.border}px solid ${FRAME.mit.color}`, ...edgeShadow(3, accent) }),
            });
            r3.push({
              label: 'SCHRIFTLICH',
              colSpan: examCount + 1,
              arrow: { collapsed: schrCollapsed, onClick: () => toggleSchr(quarter.id) },
              style: frameTh({ background: colors.schBgStrong, borderTop: `${FRAME.schr.border}px solid ${FRAME.schr.color}`, ...edgeShadow(FRAME.schr.border, FRAME.schr.color) }),
            });

            let i = 0;
            while (i < cols.length) {
              const c = cols[i];
              if (c.kind === 'lesson') {
                const { dow, label } = formatShortDate(c.lesson.date);
                r3b.push({ label: `${dow}\n${label}`, rowSpan: 2, style: th({ background: colors.mitBgStrong, width: 28, ...(c.isQuarterEdge && edgeShadow(3, accent)) }) });
                i += 1;
              } else if (c.kind === 'mitAvg') {
                r3b.push({
                  label: 'Ø MIT.',
                  rowSpan: 2,
                  weight: { value: quarter.weight_mitarbeit, onChange: setQuarterWeight(quarter, 'weightMitarbeit') },
                  style: th({ background: colors.mitBgStrong, width: 40, color: colors.teal, fontWeight: 600, borderRight: `${FRAME.mit.border}px solid ${FRAME.mit.color}`, ...(c.isQuarterEdge && edgeShadow(3, accent)) }),
                });
                i += 1;
              } else if (c.kind === 'exam') {
                const kind = c.examKind;
                let j = i;
                while (j < cols.length && cols[j].kind === 'exam' && cols[j].examKind === kind) j += 1;
                const count = j - i;
                // The first kind-group continues SCHRIFTLICH's own left edge
                // down (own color, via shadow so it can't be recolored by
                // Ø MIT.'s real border-right next door); later kind-groups
                // are separated from each other by a plain neutral divider.
                const groupEdge = c.isSchrEdge ? edgeShadow(FRAME.schr.border, FRAME.schr.color) : { borderLeft: `2px solid ${colors.borderStrong}` };
                r3b.push({ label: SECTION_LABELS[kind], colSpan: count, style: th({ background: KIND_BG[kind], color: colors.gold, fontWeight: 600, ...groupEdge }) });
                for (let k = i; k < j; k += 1) {
                  const work = cols[k].work;
                  r4.push({
                    label: `${KIND_BADGE[kind]} · ${wrapLabel(work.title.length > 16 ? `${work.title.slice(0, 15)}…` : work.title)}`,
                    weight: { value: work.weight, onChange: (e) => api.updateWrittenWork(work.id, { weight: parseWeight(e.target.value) }) },
                    style: th({ background: KIND_BG[kind], width: 46, color: colors.gold, ...(k === i && groupEdge) }),
                  });
                }
                i = j;
              } else if (c.kind === 'schrAvg') {
                r3b.push({
                  label: 'Ø SCHR.',
                  rowSpan: 2,
                  weight: { value: quarter.weight_schriftlich, onChange: setQuarterWeight(quarter, 'weightSchriftlich') },
                  style: th({ background: colors.schBgStrong, width: 40, color: colors.gold, fontWeight: 600, borderRight: `${FRAME.schr.border}px solid ${FRAME.schr.color}`, ...(c.isSchrEdge && edgeShadow(FRAME.schr.border, FRAME.schr.color)) }),
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
            style: th({ background: colors.qBg, width: 44, color: colors.teal, fontWeight: 700, borderRight: `3px solid ${accent}` }),
          });
        });
      }

      // Same reasoning as Q-Note above: HJ-Note is half's own average,
      // pushed after all of this half's quarters.
      r2.push({
        label: 'HJ-NOTE',
        rowSpan: 4,
        weight: { value: half.weight, onChange: setHalfWeight(half) },
        style: th({
          background: colors.hBg,
          width: 48,
          color: colors.tealDark,
          fontWeight: 700,
          borderRight: `${FRAME.half.border}px solid ${FRAME.half.color}`,
          ...(half.id === currentHalfId && { position: 'sticky', right: currentHalfRight, zIndex: 2 }),
        }),
      });
    });
  }

  if (scope === 'year') {
    // And Zeugnis is year's own average, pushed after both halves.
    r1.push({ label: 'ZEUGNIS', rowSpan: 5, style: th({ background: colors.sidebarBg, color: '#fff', width: 52, borderRight: `${FRAME.year.border}px solid ${FRAME.year.color}`, position: 'sticky', right: 0, zIndex: 2 }) });
  }

  // --- body rows ---
  const bodyRows = students.map((s, i) => {
    const cells = [
      {
        key: 'name',
        content: (
          <button onClick={() => onOpenStudent(s.id, 'matrix')} style={{ textAlign: 'left', fontWeight: 500, fontSize: 13 }}>
            {i + 1}. {studentDisplayName(s)}
          </button>
        ),
        style: td({ textAlign: 'left', background: i % 2 ? colors.cream : '#fff', position: 'sticky', left: 0, zIndex: 1, borderRight: `1px solid ${colors.border}` }),
      },
    ];

    const halfVals = [];
    halfColumns.forEach(({ half, hCollapsed, quarterCols }) => {
      const qVals = [];
      quarterCols.forEach(({ quarter, qCollapsed, cols }) => {
        const accent = QUARTER_ACCENTS[(quarter.idx - 1) % QUARTER_ACCENTS.length];
        const mitAvg = mitAvgFor(s.id, cols.find((c) => c.kind === 'mitAvg').lessons);
        const schrAvg = schrAvgFor(s.id, cols.find((c) => c.kind === 'schrAvg').works);
        const qn = qNoteFor(s.id, quarter, mitAvg, schrAvg);
        qVals.push([qn, quarter.weight_quarter]);

        if (!collapsed.year && !hCollapsed && !qCollapsed) {
          cols.forEach((c) => {
            if (c.kind === 'lesson') {
              const g = gradeOf(c.lesson.grades, s.id);
              const v = num(g);
              cells.push({
                key: `l${c.lesson.id}`,
                content: g || '·',
                style: td({ background: colors.cream, color: g ? gradeColor(v) : '#c4bba6', ...GRADE_TYPE_SCALE.single, ...(c.isQuarterEdge && edgeShadow(3, accent)) }),
              });
            } else if (c.kind === 'mitAvg') {
              cells.push({
                key: `mit${quarter.id}`,
                content: fmt(mitAvg),
                style: td({ background: colors.mitBgStrong, color: mitAvg == null ? '#c4bba6' : gradeColor(mitAvg), ...GRADE_TYPE_SCALE.average, borderRight: `${FRAME.mit.border}px solid ${FRAME.mit.color}`, ...(c.isQuarterEdge && edgeShadow(3, accent)) }),
              });
            } else if (c.kind === 'exam') {
              const g = gradeOf(c.work.grades, s.id);
              const v = num(g);
              cells.push({
                key: `e${c.work.id}`,
                content: g || '·',
                style: td({ background: KIND_BG_LIGHT[c.examKind], color: g ? gradeColor(v) : '#c4bba6', ...GRADE_TYPE_SCALE.single, ...(c.isSchrEdge && edgeShadow(FRAME.schr.border, FRAME.schr.color)) }),
              });
            } else if (c.kind === 'schrAvg') {
              cells.push({
                key: `schr${quarter.id}`,
                content: fmt(schrAvg),
                style: td({ background: colors.schBgStrong, color: schrAvg == null ? '#c4bba6' : gradeColor(schrAvg), ...GRADE_TYPE_SCALE.average, borderRight: `${FRAME.schr.border}px solid ${FRAME.schr.color}`, ...(c.isSchrEdge && edgeShadow(FRAME.schr.border, FRAME.schr.color)) }),
              });
            }
          });
        }

        if (!collapsed.year && !hCollapsed) {
          cells.push({
            key: `q${quarter.id}`,
            content: fmt(qn),
            style: td({ background: colors.qBg, color: qn == null ? '#c4bba6' : gradeColor(qn), ...GRADE_TYPE_SCALE.summary, borderRight: `3px solid ${accent}` }),
          });
        }
      });

      const hn = wavg(qVals);
      halfVals.push([hn, half.weight]);
      if (!collapsed.year) {
        cells.push({
          key: `h${half.id}`,
          content: fmt(hn),
          style: td({
            background: colors.hBg,
            color: hn == null ? '#c4bba6' : gradeColor(hn),
            ...GRADE_TYPE_SCALE.summary,
            borderRight: `${FRAME.half.border}px solid ${FRAME.half.color}`,
            ...(half.id === currentHalfId && { position: 'sticky', right: currentHalfRight, zIndex: 1 }),
          }),
        });
      }
    });

    if (scope === 'year') {
      const zn = wavg(halfVals);
      cells.push({
        key: 'zeugnis',
        content: fmt(zn),
        style: td({ background: colors.sidebarBg, color: '#fff', ...GRADE_TYPE_SCALE.summary, borderRight: `${FRAME.year.border}px solid ${FRAME.year.color}`, position: 'sticky', right: 0, zIndex: 1 }),
      });
    }

    return { student: s, cells };
  });

  const colCount = r4.length + r3b.length + 2;

  const renderHeaderCell = (c, idx) => (
    <th key={idx} colSpan={c.colSpan} rowSpan={c.rowSpan} style={c.style}>
      {c.label}
      {c.weight && <WeightInput value={c.weight.value} onChange={c.weight.onChange} />}
      {c.arrow && <CollapseArrow collapsed={c.arrow.collapsed} onClick={c.arrow.onClick} dark={c.arrow.dark} />}
    </th>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 24px', borderBottom: `1px solid ${colors.border}`, flexWrap: 'wrap' }}>
        <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em', marginRight: 4 }}>ZEITRAUM</span>
        {SCOPES.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setScope(key)}
            style={{
              padding: '6px 12px',
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 500,
              border: `1px solid ${scope === key ? colors.teal : colors.borderStrong}`,
              background: scope === key ? colors.teal : '#fff',
              color: scope === key ? '#fff' : colors.mutedStrong,
            }}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setShowLessons((v) => !v)}
          style={{ marginLeft: 8, padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 500, border: `1px solid ${colors.borderStrong}`, background: showLessons ? colors.tealTint : '#fff', color: colors.mutedStrong }}
        >
          {showLessons ? 'Einzelstunden ausblenden' : 'Einzelstunden einblenden'}
        </button>
        <button
          onClick={() => setShowWrittenSingles((v) => !v)}
          style={{ padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 500, border: `1px solid ${colors.borderStrong}`, background: showWrittenSingles ? colors.tealTint : '#fff', color: colors.mutedStrong }}
        >
          {showWrittenSingles ? 'Einzelne Schriftl. Noten ausblenden' : 'Einzelne Schriftl. Noten einblenden'}
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: colors.muted }}>Gewichte im weißen Feld über jeder Note · Pfeil unten rechts klappt einen Rahmen ein/aus</span>
      </div>

      <div className="matrix-scroll" style={{ flex: 1, overflow: 'auto' }}>
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
