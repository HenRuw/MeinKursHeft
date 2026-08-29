import { useState } from 'react';
import { colors, fonts } from '../theme.js';
import { num, fmt, wavg, gradeColor, studentDisplayName, WRITTEN_WORK_KINDS, writtenWorkKindLabel } from '../lib/gradeMath.js';
import { currentQuarter, formatShortDate } from '../lib/dates.js';
import GradeLineChart from '../components/GradeLineChart.jsx';

function mitAvgFor(studentId, lessons) {
  const vals = lessons.map((l) => num(l.grades.find((g) => g.student_id === studentId)?.grade)).filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
function schrAvgFor(studentId, works) {
  return wavg(works.map((w) => [num(w.grades.find((g) => g.student_id === studentId)?.grade), w.weight]));
}

function Kpi({ label, value, note, strong }) {
  return (
    <div style={{ background: strong ? colors.sidebarBg : '#fff', border: `1px solid ${strong ? colors.sidebarBg : colors.borderCard}`, borderRadius: 11, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ font: `500 9.5px ${fonts.mono}`, color: strong ? '#9fb0ab' : colors.muted, letterSpacing: '.09em' }}>{label}</span>
      <span style={{ font: `500 26px/1 ${fonts.serif}`, color: strong ? '#fff' : colors.ink }}>{value}</span>
      <span style={{ fontSize: 11.5, color: strong ? '#9fb0ab' : colors.muted }}>{note}</span>
    </div>
  );
}

export default function Schueleransicht({ bundle, studentId, onBack }) {
  const student = bundle.students.find((s) => s.id === studentId);
  const quarters = [...bundle.quarters].sort((a, b) => a.idx - b.idx);
  const halves = [...bundle.halves].sort((a, b) => a.idx - b.idx);

  const [selectedQuarterIds, setSelectedQuarterIds] = useState(() => quarters.map((q) => q.id));
  const [examKind, setExamKind] = useState('klassenarbeit');

  if (!student) return null;

  const toggleQuarter = (id) =>
    setSelectedQuarterIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // --- KPIs ---
  const activeQuarter = currentQuarter(quarters);
  const activeHalf = activeQuarter && halves.find((h) => h.id === activeQuarter.half_id);

  const quarterResults = quarters.map((q) => {
    const qLessons = bundle.lessons.filter((l) => l.quarter_id === q.id);
    const qWorks = bundle.writtenWorks.filter((w) => w.quarter_id === q.id);
    const mit = mitAvgFor(studentId, qLessons);
    const schr = schrAvgFor(studentId, qWorks);
    const qNote = wavg([[mit, q.weight_mitarbeit], [schr, q.weight_schriftlich]]);
    return { quarter: q, mit, schr, qNote };
  });

  const halfResults = halves.map((h) => {
    const qs = quarterResults.filter((r) => r.quarter.half_id === h.id);
    return { half: h, hjNote: wavg(qs.map((r) => [r.qNote, r.quarter.weight_quarter])) };
  });

  const zeugnis = wavg(halfResults.map((r) => [r.hjNote, r.half.weight]));
  const currentHalfResult = activeHalf && halfResults.find((r) => r.half.id === activeHalf.id);

  const allLessons = bundle.lessons;
  const oralVals = allLessons.map((l) => num(l.grades.find((g) => g.student_id === studentId)?.grade)).filter((v) => v != null);
  const oralAvg = oralVals.length ? oralVals.reduce((a, b) => a + b, 0) / oralVals.length : null;
  const writtenAvg = schrAvgFor(studentId, bundle.writtenWorks);

  // --- chart: Verlauf Einzelstunden, filterable by one or more quarters ---
  const lessonPoints = allLessons
    .filter((l) => selectedQuarterIds.includes(l.quarter_id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => {
      const grade = l.grades.find((g) => g.student_id === studentId)?.grade;
      const v = num(grade);
      if (v == null) return null;
      return { date: formatShortDate(l.date).label, label: grade, value: v };
    })
    .filter(Boolean);

  // --- chart: Schriftliche Leistungen, filterable to one kind ---
  const examPoints = bundle.writtenWorks
    .filter((w) => w.kind === examKind)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => {
      const grade = w.grades.find((g) => g.student_id === studentId)?.grade;
      const v = num(grade);
      if (v == null) return null;
      return { date: formatShortDate(w.date).label, label: grade, value: v };
    })
    .filter(Boolean);

  const allWorks = [...bundle.writtenWorks].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 24px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px 7px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 8, background: '#fff', color: colors.mutedStrong, fontSize: 12.5 }}>
          ‹ Zurück
        </button>
        <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 99, background: colors.sidebarBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `500 15px ${fonts.sans}` }}>
          {student.first_name[0]}
          {student.last_name[0]}
        </span>
        <span style={{ font: `500 21px/1.1 ${fonts.serif}` }}>{studentDisplayName(student)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Kpi label={activeHalf ? `${activeHalf.idx}. HALBJAHR` : 'HALBJAHR'} value={fmt(currentHalfResult?.hjNote)} note="Ø aus den Quartalsnoten" strong />
        <Kpi label="GANZJAHR (PROGNOSE)" value={fmt(zeugnis)} note="Ø aus beiden Halbjahren" />
        <Kpi label="Ø MÜNDLICH" value={fmt(oralAvg)} note={`${oralVals.length} bewertete Stunden`} />
        <Kpi label="Ø SCHRIFTLICH" value={fmt(writtenAvg)} note={`${bundle.writtenWorks.length} Arbeiten, gewichtet`} />
      </div>

      <div style={{ background: '#fff', border: `1px solid ${colors.borderCard}`, borderRadius: 11, padding: '16px 18px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>VERLAUF EINZELSTUNDEN</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {quarters.map((q) => {
              const on = selectedQuarterIds.includes(q.id);
              return (
                <button
                  key={q.id}
                  onClick={() => toggleQuarter(q.id)}
                  style={{ padding: '5px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, border: `1px solid ${on ? colors.teal : colors.borderStrong}`, background: on ? colors.teal : '#fff', color: on ? '#fff' : colors.mutedStrong }}
                >
                  {q.idx}. Quartal
                </button>
              );
            })}
          </span>
        </div>
        <GradeLineChart points={lessonPoints} lineColor={colors.teal} emptyLabel="Keine bewerteten Stunden in den gewählten Quartalen." />
      </div>

      <div style={{ background: '#fff', border: `1px solid ${colors.borderCard}`, borderRadius: 11, padding: '16px 18px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>VERLAUF SCHRIFTLICHE LEISTUNGEN</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
            {WRITTEN_WORK_KINDS.map((k) => {
              const on = examKind === k.value;
              return (
                <button
                  key={k.value}
                  onClick={() => setExamKind(k.value)}
                  style={{ padding: '5px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, border: `1px solid ${on ? '#c9852a' : colors.borderStrong}`, background: on ? '#c9852a' : '#fff', color: on ? '#fff' : colors.mutedStrong }}
                >
                  {k.label}
                </button>
              );
            })}
          </span>
        </div>
        <GradeLineChart points={examPoints} lineColor="#c9852a" emptyLabel="Keine bewerteten Arbeiten dieser Kategorie." />
      </div>

      <div style={{ background: '#fff', border: `1px solid ${colors.borderCard}`, borderRadius: 11, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 10px', font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>SCHRIFTLICHE LEISTUNGEN</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['ARBEIT', 'ART', 'DATUM', 'INHALT', 'NOTE'].map((h, i) => (
                <th key={h} style={{ textAlign: i === 4 ? 'center' : 'left', padding: i === 0 || i === 4 ? '8px 18px' : '8px 12px', background: '#faf8f4', borderTop: `1px solid ${colors.divider}`, borderBottom: `1px solid ${colors.divider}`, font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allWorks.map((w) => {
              const grade = w.grades.find((g) => g.student_id === studentId)?.grade;
              const v = num(grade);
              return (
                <tr key={w.id}>
                  <td style={{ padding: '11px 18px', borderBottom: `1px solid ${colors.divider}`, fontSize: 13, fontWeight: 500 }}>{w.title}</td>
                  <td style={{ padding: '11px 12px', borderBottom: `1px solid ${colors.divider}`, fontSize: 12, color: colors.mutedStrong }}>{writtenWorkKindLabel(w.kind)}</td>
                  <td style={{ padding: '11px 12px', borderBottom: `1px solid ${colors.divider}`, font: `500 11.5px ${fonts.mono}`, color: colors.mutedStrong }}>{w.date}</td>
                  <td style={{ padding: '11px 12px', borderBottom: `1px solid ${colors.divider}`, fontSize: 12, color: colors.mutedStrong }}>{w.content}</td>
                  <td style={{ padding: '11px 18px', borderBottom: `1px solid ${colors.divider}`, textAlign: 'center' }}>
                    <span style={{ font: `600 12.5px ${fonts.mono}`, padding: '4px 9px', borderRadius: 99, background: '#f2efe9', color: grade ? gradeColor(v) : colors.faint }}>{grade || '–'}</span>
                  </td>
                </tr>
              );
            })}
            {!allWorks.length && (
              <tr>
                <td colSpan={5} style={{ padding: '14px 18px', fontSize: 12.5, color: colors.mutedStrong }}>
                  Noch keine schriftlichen Leistungen erfasst.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
