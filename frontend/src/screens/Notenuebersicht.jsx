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
import { formatShortDate, formatDateRange } from '../lib/dates.js';
import { usePersisted } from '../lib/usePersisted.js';
import WeightInput from '../components/WeightInput.jsx';

const KIND_BADGE = { klassenarbeit: 'KA', test: 'T', sonstige: 'SO' };
const KIND_BG = { klassenarbeit: '#fdf7e9', test: '#fbf0da', sonstige: '#f6ead0' };

const SCOPES = [
  ['year', 'Schuljahr'],
  ['h1', '1. Halbjahr'],
  ['h2', '2. Halbjahr'],
];

function buildQuarterColumns(quarter, lessons, works, showLessons, showWrittenSingles) {
  const cols = [];
  const qLessons = lessons.filter((l) => l.quarter_id === quarter.id).sort((a, b) => a.date.localeCompare(b.date));
  if (showLessons) qLessons.forEach((lesson) => cols.push({ kind: 'lesson', lesson }));
  cols.push({ kind: 'mitAvg', lessons: qLessons });

  const kindGroups = WRITTEN_WORK_KINDS.map((k) => ({
    kind: k.value,
    works: works.filter((w) => w.quarter_id === quarter.id && w.kind === k.value).sort((a, b) => a.date.localeCompare(b.date)),
  }));
  if (showWrittenSingles) {
    kindGroups.forEach((group) => group.works.forEach((work) => cols.push({ kind: 'exam', work, examKind: group.kind })));
  }
  const allWorks = kindGroups.flatMap((g) => g.works);
  cols.push({ kind: 'schrAvg', works: allWorks });
  cols.push({ kind: 'qNote', quarter });

  if (cols[0]) cols[0].quarterStart = quarter;
  return cols;
}

export default function Notenuebersicht({ bundle, onOpenStudent }) {
  const [scope, setScope] = usePersisted(`notenuebersicht:${bundle.course.id}:scope`, 'year');
  const [showLessons, setShowLessons] = usePersisted(`notenuebersicht:${bundle.course.id}:showLessons`, true);
  const [showWrittenSingles, setShowWrittenSingles] = usePersisted(`notenuebersicht:${bundle.course.id}:showWrittenSingles`, true);
  // Row/column highlight is a placeholder (per product decision, real design
  // exploration deferred): a full-row hover highlight only, since aligning a
  // per-column highlight across the multi-row header would need every header
  // row and every body row to share one column index, which the current
  // rowSpan-based header layout doesn't provide for free.
  const [hoverRow, setHoverRow] = useState(null);

  const halves = [...bundle.halves].sort((a, b) => a.idx - b.idx);
  const quarters = [...bundle.quarters].sort((a, b) => a.idx - b.idx);
  const students = sortStudents(bundle.students);

  const visibleHalfIdx = scope === 'h1' ? [1] : scope === 'h2' ? [2] : [1, 2];
  const visHalves = halves.filter((h) => visibleHalfIdx.includes(h.idx));

  const quartersByHalf = (half) => quarters.filter((q) => q.half_id === half.id);

  const setQuarterWeight = (quarter, field) => (e) => api.updateQuarter(quarter.id, { [field]: parseWeight(e.target.value) });
  const setHalfWeight = (half) => (e) => api.updateHalf(half.id, { weight: parseWeight(e.target.value) });

  // Shared column model for header + body, half -> quarter -> columns[]
  const halfColumns = visHalves.map((half) => ({
    half,
    quarterCols: quartersByHalf(half).map((quarter) => ({
      quarter,
      cols: buildQuarterColumns(quarter, bundle.lessons, bundle.writtenWorks, showLessons, showWrittenSingles),
    })),
  }));

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

  // --- computation helpers ---
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

  // --- header rows ---
  const r1 = [{ label: 'SCHÜLER:IN', rowSpan: 4, colKey: 'name', style: th({ textAlign: 'left', minWidth: 190, background: '#efece5', position: 'sticky', left: 0, zIndex: 3 }) }];
  const r2 = [];
  const r3 = [];
  const r4 = [];

  halfColumns.forEach(({ half, quarterCols }) => {
    const halfWidth = quarterCols.reduce((a, qc) => a + qc.cols.length, 0) + 1;
    r1.push({
      label: `${half.idx}. HALBJAHR`,
      colSpan: halfWidth,
      style: th({ background: colors.hBg, color: colors.tealDark, fontWeight: 700, borderTop: `2px solid ${colors.tealDark}` }),
    });

    quarterCols.forEach(({ quarter, cols }) => {
      const accent = QUARTER_ACCENTS[(quarter.idx - 1) % QUARTER_ACCENTS.length];
      r2.push({
        label: wrapLabel(`${quarter.idx}. Quartal · ${formatDateRange(quarter.start_date, quarter.end_date)}`),
        colSpan: cols.length,
        style: th({ background: colors.qBg, fontWeight: 600, borderLeft: `3px solid ${accent}` }),
      });

      const lessonCount = cols.filter((c) => c.kind === 'lesson').length;
      const examCount = cols.filter((c) => c.kind === 'exam').length;
      r3.push(
        { label: 'MITARBEIT', colSpan: lessonCount + 1, style: th({ background: colors.mitBg, borderLeft: `3px solid ${accent}` }) },
        { label: 'SCHRIFTLICH', colSpan: examCount + 1, style: th({ background: colors.schBg }) },
        {
          label: `${quarter.idx}.Q-Note`,
          rowSpan: 2,
          weight: { value: quarter.weight_quarter, onChange: setQuarterWeight(quarter, 'weightQuarter') },
          style: th({ background: colors.qBg, width: 44, color: colors.teal, fontWeight: 700, borderRight: `2px solid #c9a24a` }),
        }
      );

      cols.forEach((c) => {
        if (c.kind === 'lesson') {
          const { dow, label } = formatShortDate(c.lesson.date);
          r4.push({ label: `${dow}\n${label}`, style: th({ background: colors.mitBg, width: 28, borderLeft: c.quarterStart ? `3px solid ${accent}` : undefined }) });
        } else if (c.kind === 'mitAvg') {
          r4.push({
            label: 'Ø MIT.',
            weight: { value: quarter.weight_mitarbeit, onChange: setQuarterWeight(quarter, 'weightMitarbeit') },
            style: th({ background: colors.mitBg, width: 40, color: colors.teal, fontWeight: 600, borderRight: '2px solid #8fada3', borderLeft: c.quarterStart ? `3px solid ${accent}` : undefined }),
          });
        } else if (c.kind === 'exam') {
          r4.push({
            label: `${KIND_BADGE[c.examKind]} · ${wrapLabel(c.work.title.length > 16 ? `${c.work.title.slice(0, 15)}…` : c.work.title)}`,
            weight: { value: c.work.weight, onChange: (e) => api.updateWrittenWork(c.work.id, { weight: parseWeight(e.target.value) }) },
            style: th({ background: KIND_BG[c.examKind], width: 46, color: colors.gold }),
          });
        } else if (c.kind === 'schrAvg') {
          r4.push({
            label: 'Ø SCHR.',
            weight: { value: quarter.weight_schriftlich, onChange: setQuarterWeight(quarter, 'weightSchriftlich') },
            style: th({ background: colors.schBg, width: 40, color: colors.gold, fontWeight: 600, borderRight: '2px solid #c9a24a' }),
          });
        }
      });
    });

    r2.push({
      label: 'HJ-NOTE',
      rowSpan: 3,
      weight: { value: half.weight, onChange: setHalfWeight(half) },
      style: th({ background: colors.hBg, width: 48, color: colors.tealDark, fontWeight: 700, borderRight: `3px solid ${colors.tealDark}` }),
    });
  });

  if (scope === 'year') {
    r1.push({ label: 'ZEUGNIS', rowSpan: 4, style: th({ background: colors.sidebarBg, color: '#fff', width: 52 }) });
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
    halfColumns.forEach(({ half, quarterCols }) => {
      const qVals = [];
      quarterCols.forEach(({ quarter, cols }) => {
        const accent = QUARTER_ACCENTS[(quarter.idx - 1) % QUARTER_ACCENTS.length];
        let mitAvg = null;
        let schrAvg = null;
        cols.forEach((c) => {
          if (c.kind === 'lesson') {
            const g = gradeOf(c.lesson.grades, s.id);
            const v = num(g);
            cells.push({
              key: `l${c.lesson.id}`,
              content: g || '·',
              style: td({ background: colors.mitBg, color: g ? gradeColor(v) : '#c4bba6', ...GRADE_TYPE_SCALE.single, borderLeft: c.quarterStart ? `3px solid ${accent}` : undefined }),
            });
          } else if (c.kind === 'mitAvg') {
            mitAvg = mitAvgFor(s.id, c.lessons);
            cells.push({
              key: `mit${quarter.id}`,
              content: fmt(mitAvg),
              style: td({ background: colors.mitBg, color: mitAvg == null ? '#c4bba6' : gradeColor(mitAvg), ...GRADE_TYPE_SCALE.average, borderRight: '2px solid #8fada3', borderLeft: c.quarterStart ? `3px solid ${accent}` : undefined }),
            });
          } else if (c.kind === 'exam') {
            const g = gradeOf(c.work.grades, s.id);
            const v = num(g);
            cells.push({
              key: `e${c.work.id}`,
              content: g || '·',
              style: td({ background: KIND_BG[c.examKind], color: g ? gradeColor(v) : '#c4bba6', ...GRADE_TYPE_SCALE.single }),
            });
          } else if (c.kind === 'schrAvg') {
            schrAvg = schrAvgFor(s.id, c.works);
            cells.push({
              key: `schr${quarter.id}`,
              content: fmt(schrAvg),
              style: td({ background: colors.schBg, color: schrAvg == null ? '#c4bba6' : gradeColor(schrAvg), ...GRADE_TYPE_SCALE.average, borderRight: '2px solid #c9a24a' }),
            });
          } else if (c.kind === 'qNote') {
            const qn = qNoteFor(s.id, quarter, mitAvg, schrAvg);
            qVals.push([qn, quarter.weight_quarter]);
            cells.push({
              key: `q${quarter.id}`,
              content: fmt(qn),
              style: td({ background: colors.qBg, color: qn == null ? '#c4bba6' : gradeColor(qn), ...GRADE_TYPE_SCALE.summary, borderRight: '2px solid #c9a24a' }),
            });
          }
        });
      });
      const hn = wavg(qVals);
      halfVals.push([hn, half.weight]);
      cells.push({
        key: `h${half.id}`,
        content: fmt(hn),
        style: td({ background: colors.hBg, color: hn == null ? '#c4bba6' : gradeColor(hn), ...GRADE_TYPE_SCALE.summary, borderRight: `3px solid ${colors.tealDark}` }),
      });
    });

    if (scope === 'year') {
      const zn = wavg(halfVals);
      cells.push({
        key: 'zeugnis',
        content: fmt(zn),
        style: td({ background: colors.sidebarBg, color: '#fff', ...GRADE_TYPE_SCALE.summary }),
      });
    }

    return { student: s, cells };
  });

  const colCount = r4.length + 2; // name + r4 leaves + q-notes handled via rowSpan, rough count for hover indexing not required

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
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: colors.muted }}>Gewichte im weißen Feld über jeder Note · Quartal = Ø(Mitarbeit, Schriftlich)</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse' }} onMouseLeave={() => setHoverRow(null)}>
          <thead>
            <tr>{r1.map((c, idx) => <th key={idx} colSpan={c.colSpan} rowSpan={c.rowSpan} style={c.style}>{c.label}</th>)}</tr>
            <tr>
              {r2.map((c, idx) => (
                <th key={idx} colSpan={c.colSpan} rowSpan={c.rowSpan} style={c.style}>
                  {c.label}
                  {c.weight && <WeightInput value={c.weight.value} onChange={c.weight.onChange} />}
                </th>
              ))}
            </tr>
            <tr>
              {r3.map((c, idx) => (
                <th key={idx} colSpan={c.colSpan} rowSpan={c.rowSpan} style={c.style}>
                  {c.label}
                  {c.weight && <WeightInput value={c.weight.value} onChange={c.weight.onChange} />}
                </th>
              ))}
            </tr>
            <tr>
              {r4.map((c, idx) => (
                <th key={idx} style={c.style}>
                  {c.label}
                  {c.weight && <WeightInput value={c.weight.value} onChange={c.weight.onChange} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map(({ student, cells }, rowIdx) => (
              <tr key={student.id} onMouseEnter={() => setHoverRow(rowIdx)}>
                {cells.map((c) => (
                  <td key={c.key} style={{ ...c.style, boxShadow: hoverRow === rowIdx ? 'inset 0 0 0 999px rgba(15,91,82,.07)' : undefined }}>
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
