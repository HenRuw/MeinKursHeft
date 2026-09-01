import { useState } from 'react';
import { colors, fonts } from '../theme.js';
import { num, fmt, isNb, gradeColor, gradeLabel, studentDisplayName, studentKlasseLabel, calcAverages, WRITTEN_WORK_KINDS, writtenWorkKindLabel } from '../lib/gradeMath.js';
import { formatShortDate, currentQuarter } from '../lib/dates.js';
import { usePersisted } from '../lib/usePersisted.js';
import { useViewport } from '../lib/useViewport.js';
import GradeLineChart from '../components/GradeLineChart.jsx';
import CollapseArrow from '../components/CollapseArrow.jsx';
import Notenuebersicht from './Notenuebersicht.jsx';

// One place that turns a resolved average ({ value, overridden, grade }) into
// the text + color both the Kennzahlen strip and the grade overview show, so
// "–" for empty, "n.b." for a Nicht-bewertbar override and the gradeColor
// gradient can never diverge between the two.
function avgDisplay(a) {
  if (!a || a.value == null) return { text: a && isNb(a.grade) ? 'n.b.' : '–', color: colors.faint, overridden: a?.overridden };
  return { text: fmt(a.value), color: gradeColor(a.value), overridden: a.overridden };
}

// A single headline number: label on top, big serif value (color-coded for
// grades via valueColor), quiet note below. Reused for the whole Kennzahlen
// strip — grade averages and attendance counts alike.
function Kpi({ label, value, note, valueColor, strong }) {
  return (
    <div style={{ background: strong ? colors.sidebarBg : '#fff', border: `1px solid ${strong ? colors.sidebarBg : colors.borderCard}`, borderRadius: 11, padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ font: `500 9.5px ${fonts.mono}`, color: strong ? '#9fb0ab' : colors.muted, letterSpacing: '.09em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ font: `500 25px/1 ${fonts.serif}`, color: valueColor || (strong ? '#fff' : colors.ink) }}>{value}</span>
      <span style={{ fontSize: 11, color: strong ? '#9fb0ab' : colors.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note}</span>
    </div>
  );
}

// Shared shell for every block below the header: a titled card whose whole
// header row toggles between showing and hiding its body, so a long student
// page can be collapsed down to just the headings that matter right now —
// same idea as the frame-collapse arrows in the Notenübersicht.
function CollapsibleSection({ title, collapsed, onToggle, headerExtra, children }) {
  return (
    // flexShrink: 0 matters here — this sits in Schueleransicht's flex-column
    // page, and overflow:hidden (for the rounded corners) disables a flex
    // item's normal "never shrink below your content" protection. Without
    // an explicit flexShrink:0, the flex-shrink algorithm squeezes exactly
    // this card down to make everything else fit, clipping the embedded
    // Notenübersicht instead of letting the page scroll like every sibling.
    <div style={{ background: '#fff', border: `1px solid ${colors.borderCard}`, borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: collapsed ? 'none' : `1px solid ${colors.divider}`, flexWrap: 'wrap' }}>
        <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <CollapseArrow collapsed={collapsed} size={16} fontSize={10} />
          <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>{title}</span>
        </button>
        {!collapsed && headerExtra}
      </div>
      {!collapsed && children}
    </div>
  );
}

// One cell of the compact per-student grade overview: a tinted box with the
// grade value centered, colored by gradeColor and marked with ✎ when the
// value is a manual override — the same visual vocabulary as the matrix's
// average cells, just laid out for a single student instead of a whole class.
function GradeCell({ a, bg, strong }) {
  const { text, color, overridden } = avgDisplay(a);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, padding: '9px 6px', borderRadius: 8 }}>
      <span style={{ font: `500 ${strong ? 19 : 17}px/1 ${fonts.serif}`, color }}>
        {text}
        {overridden && <span title="Manuell eingetragen – nicht berechnet" style={{ marginLeft: 3, fontSize: 8, verticalAlign: 'super' }}>✎</span>}
      </span>
    </div>
  );
}

const ATTENDANCE_TABLE_HEADERS = ['DATUM', 'THEMA', 'ART', 'DETAIL'];

export default function Schueleransicht({ bundle, studentId, onRefresh, onBack, onOpenLesson, onOpenWork }) {
  const { isMobile } = useViewport();
  const student = bundle.students.find((s) => s.id === studentId);
  const quarters = [...bundle.quarters].sort((a, b) => a.idx - b.idx);
  const halves = [...bundle.halves].sort((a, b) => a.idx - b.idx);

  const [selectedQuarterIds, setSelectedQuarterIds] = useState(() => quarters.map((q) => q.id));
  const [examKind, setExamKind] = useState('klassenarbeit');
  const [collapsed, setCollapsed] = usePersisted(`schueleransicht:${studentId}:collapsed`, {
    grades: false,
    lessonsChart: false,
    examsChart: false,
    detail: true, // the full class-style matrix stays folded away by default
  });

  if (!student) return null;

  const toggleQuarter = (id) =>
    setSelectedQuarterIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleSection = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const allLessons = bundle.lessons;

  // Every roll-up (Ø Mit / Ø Schr / Q-Note per quarter, HJ-Note per half,
  // Zeugnis) comes from the ONE shared calculator the course-wide
  // Notenübersicht uses too, so the compact overview and the detailed matrix
  // below can never show different numbers.
  const courseId = bundle.realCourseId ?? bundle.course.id;
  const overrides = bundle.gradeOverrides || [];
  const avgs = calcAverages(bundle, overrides, studentId, courseId);
  const curQuarter = currentQuarter(quarters);

  // The detailed grade breakdown (the collapsible "Ausführliche
  // Notenübersicht" at the bottom) is the exact same nested Mitarbeit/
  // Schriftlich/Quartal/Halbjahr matrix as the course-wide Notenübersicht —
  // reusing that component with a bundle scoped to just this one student keeps
  // per-lesson grades and manual overrides reachable here without duplicating
  // any of it. A synthetic course id keeps its collapse/scope preferences
  // (localStorage) isolated from the real Notenübersicht and other students.
  const soloBundle = {
    ...bundle,
    course: { ...bundle.course, id: `${bundle.course.id}-solo-${studentId}` },
    realCourseId: bundle.course.id,
    students: [student],
  };
  const noop = () => {};

  // --- Anwesenheit: Verspätungen / Fehlstunden / unentschuldigte Fehlstunden ---
  const attendanceEntries = allLessons
    .map((l) => ({ lesson: l, att: l.attendance.find((a) => a.student_id === studentId) }))
    .filter(({ att }) => att && att.status !== 'anwesend')
    .sort((a, b) => a.lesson.date.localeCompare(b.lesson.date));
  const lateEntries = attendanceEntries.filter(({ att }) => att.status === 'verspaetet');
  const absentEntries = attendanceEntries.filter(({ att }) => att.status === 'fehlt');
  const unexcusedEntries = absentEntries.filter(({ att }) => !att.excused);

  // --- Kommentare aus den Einzelstunden ---
  const lessonComments = allLessons
    .flatMap((l) => l.remarks.filter((r) => r.student_id === studentId).map((r) => ({ ...r, lessonDate: l.date, lessonTopic: l.topic })))
    .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate));

  // --- chart: Verlauf Einzelstunden, filterable by one or more quarters.
  // Each point also carries that lesson's own remarks for this student, so the
  // chart can mark the point and show the comment behind the grade on hover. ---
  const lessonPoints = allLessons
    .filter((l) => selectedQuarterIds.includes(l.quarter_id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => {
      const grade = l.grades.find((g) => g.student_id === studentId)?.grade;
      const v = num(grade);
      if (v == null) return null;
      const remarks = l.remarks.filter((r) => r.student_id === studentId).map((r) => ({ emoji: r.emoji, text: r.text }));
      return { date: formatShortDate(l.date).label, label: grade, value: v, remarks };
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

  // The Kennzahlen strip: the current quarter's three averages, the overall
  // Zeugnis, plus attendance — everything you want to read the moment the page
  // opens, without scrolling into any section.
  const curMit = curQuarter && avgDisplay(avgs.mitByQuarter.get(curQuarter.id));
  const curSchr = curQuarter && avgDisplay(avgs.schrByQuarter.get(curQuarter.id));
  const curQ = curQuarter && avgDisplay(avgs.qNoteByQuarter.get(curQuarter.id));
  const zeugnis = avgDisplay(avgs.zeugnis);
  const quarterNote = curQuarter ? `${curQuarter.idx}. Quartal` : '—';

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: isMobile ? '0 14px 28px' : '0 24px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* The name + Zurück-Pfeil bar stays pinned to the top while the long
          student page scrolls underneath. Its background matches the page so
          scrolled content can't show through. The course-level tab header is
          hidden on this screen (App.HEADERLESS_SCREENS), so this compact bar is
          the only header — its top padding is kept small to avoid the stacked
          whitespace the two headers used to produce together. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: colors.panelBg,
          padding: isMobile ? '12px 0 10px' : '14px 0 12px',
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px 7px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 8, background: '#fff', color: colors.mutedStrong, fontSize: 12.5 }}>
          ‹ Zurück
        </button>
        <span style={{ font: `500 21px/1.1 ${fonts.serif}` }}>{studentDisplayName(student)}</span>
        {studentKlasseLabel(student) && (
          <span style={{ font: `500 12px ${fonts.mono}`, padding: '3px 9px', borderRadius: 99, background: colors.tealTint, color: colors.teal }}>{studentKlasseLabel(student)}</span>
        )}
      </div>

      {/* Kennzahlen — the at-a-glance strip right under the name. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, 1fr)', gap: 10, flexShrink: 0 }}>
        <Kpi label="Ø MITARBEIT" value={curMit ? curMit.text : '–'} valueColor={curMit?.color} note={quarterNote} />
        <Kpi label="Ø SCHRIFTLICH" value={curSchr ? curSchr.text : '–'} valueColor={curSchr?.color} note={quarterNote} />
        <Kpi label="Q-NOTE" value={curQ ? curQ.text : '–'} valueColor={curQ?.color} note={quarterNote} />
        <Kpi label="ZEUGNIS" value={zeugnis.text} note="Gesamtjahr" strong />
        <Kpi label="VERSPÄTUNGEN" value={lateEntries.length} note="Einzelstunden" valueColor={lateEntries.length ? '#d8a02a' : undefined} />
        <Kpi label="FEHLSTUNDEN" value={absentEntries.length} note={`${unexcusedEntries.length} unentschuldigt`} valueColor={unexcusedEntries.length ? colors.red : undefined} />
      </div>

      {/* Compact per-student grade overview: the same Mitarbeit/Schriftlich/
          Quartal/Halbjahr/Zeugnis colour semantics as the matrix, transposed so
          quarters are columns and the three averages are rows — legible at a
          glance instead of a one-row slice of the full class grid. */}
      <CollapsibleSection title="NOTENÜBERSICHT" collapsed={collapsed.grades} onToggle={() => toggleSection('grades')}>
        <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {quarters.length ? (
            <div style={{ overflowX: 'auto' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `minmax(96px, max-content) repeat(${quarters.length}, minmax(58px, 1fr))`,
                  gap: 6,
                  minWidth: 'max-content',
                  alignItems: 'stretch',
                }}
              >
                <div />
                {quarters.map((q) => (
                  <div key={`head-${q.id}`} style={{ textAlign: 'center', font: `500 9.5px ${fonts.mono}`, color: colors.teal, letterSpacing: '.06em', alignSelf: 'end', paddingBottom: 2 }}>
                    {q.idx}. QUARTAL
                  </div>
                ))}

                <div style={{ display: 'flex', alignItems: 'center', font: `500 9.5px ${fonts.mono}`, color: colors.mutedStrong, letterSpacing: '.06em' }}>Ø MITARBEIT</div>
                {quarters.map((q) => (
                  <GradeCell key={`mit-${q.id}`} a={avgs.mitByQuarter.get(q.id)} bg={colors.mitBg} />
                ))}

                <div style={{ display: 'flex', alignItems: 'center', font: `500 9.5px ${fonts.mono}`, color: colors.mutedStrong, letterSpacing: '.06em' }}>Ø SCHRIFTLICH</div>
                {quarters.map((q) => (
                  <GradeCell key={`schr-${q.id}`} a={avgs.schrByQuarter.get(q.id)} bg={colors.schBg} />
                ))}

                <div style={{ display: 'flex', alignItems: 'center', font: `600 9.5px ${fonts.mono}`, color: colors.teal, letterSpacing: '.06em' }}>Q-NOTE</div>
                {quarters.map((q) => (
                  <GradeCell key={`q-${q.id}`} a={avgs.qNoteByQuarter.get(q.id)} bg={colors.qBg} strong />
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: colors.mutedStrong }}>Noch keine Quartale angelegt.</div>
          )}

          {/* Halbjahres- und Zeugnisnote als Zusammenfassung. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {halves.map((h) => {
              const { text, color, overridden } = avgDisplay(avgs.hjByHalf.get(h.id));
              return (
                <div key={h.id} style={{ flex: '1 1 130px', background: colors.hBg, border: `1px solid ${colors.borderCard}`, borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.tealDark, letterSpacing: '.06em' }}>{h.idx}. HALBJAHR</span>
                  <span style={{ font: `500 22px/1 ${fonts.serif}`, color }}>
                    {text}
                    {overridden && <span title="Manuell eingetragen – nicht berechnet" style={{ marginLeft: 3, fontSize: 9, verticalAlign: 'super', color: colors.tealDark }}>✎</span>}
                  </span>
                </div>
              );
            })}
            <div style={{ flex: '1 1 130px', background: colors.sidebarBg, borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ font: `500 9.5px ${fonts.mono}`, color: '#9fb0ab', letterSpacing: '.06em' }}>ZEUGNIS</span>
              <span style={{ font: `500 22px/1 ${fonts.serif}`, color: '#fff' }}>
                {zeugnis.text}
                {zeugnis.overridden && <span title="Manuell eingetragen – nicht berechnet" style={{ marginLeft: 3, fontSize: 9, verticalAlign: 'super', color: '#9fb0ab' }}>✎</span>}
              </span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="VERLAUF EINZELSTUNDEN"
        collapsed={collapsed.lessonsChart}
        onToggle={() => toggleSection('lessonsChart')}
        headerExtra={
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
        }
      >
        <div style={{ padding: '10px 18px 16px' }}>
          <GradeLineChart points={lessonPoints} lineColor={colors.teal} emptyLabel="Keine bewerteten Stunden in den gewählten Quartalen." />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="VERLAUF SCHRIFTLICHE LEISTUNGEN"
        collapsed={collapsed.examsChart}
        onToggle={() => toggleSection('examsChart')}
        headerExtra={
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
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
        }
      >
        <div style={{ padding: '10px 18px 16px' }}>
          <GradeLineChart points={examPoints} lineColor="#c9852a" emptyLabel="Keine bewerteten Arbeiten dieser Kategorie." />
        </div>
      </CollapsibleSection>

      <div style={{ background: '#fff', border: `1px solid ${colors.borderCard}`, borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '14px 18px 10px', font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>KOMMENTARE AUS DEN EINZELSTUNDEN</div>
        {lessonComments.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {lessonComments.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 18px', borderTop: `1px solid ${colors.divider}` }}>
                <span style={{ font: `500 11.5px ${fonts.mono}`, color: colors.mutedStrong, flex: 'none' }}>{formatShortDate(r.lessonDate).label}</span>
                <span style={{ fontSize: 13 }}>
                  {r.emoji} {r.text}
                </span>
                {r.lessonTopic && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: colors.faint }}>{r.lessonTopic}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '0 18px 16px', fontSize: 12.5, color: colors.mutedStrong }}>Noch keine Kommentare aus Einzelstunden.</div>
        )}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${colors.borderCard}`, borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '14px 18px 10px', font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>ANWESENHEIT</div>
        {attendanceEntries.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {ATTENDANCE_TABLE_HEADERS.map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 18px', background: '#faf8f4', borderTop: `1px solid ${colors.divider}`, borderBottom: `1px solid ${colors.divider}`, font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendanceEntries.map(({ lesson, att }) => (
                  <tr key={lesson.id}>
                    <td style={{ padding: '10px 18px', borderBottom: `1px solid ${colors.divider}`, font: `500 11.5px ${fonts.mono}`, color: colors.mutedStrong }}>{formatShortDate(lesson.date).label}</td>
                    <td style={{ padding: '10px 18px', borderBottom: `1px solid ${colors.divider}`, fontSize: 12.5 }}>{lesson.topic || '–'}</td>
                    <td style={{ padding: '10px 18px', borderBottom: `1px solid ${colors.divider}`, fontSize: 12.5, fontWeight: 500, color: att.status === 'fehlt' ? colors.red : '#d8a02a' }}>
                      {att.status === 'fehlt' ? 'Fehlt' : 'Verspätet'}
                    </td>
                    <td style={{ padding: '10px 18px', borderBottom: `1px solid ${colors.divider}`, fontSize: 12.5, color: colors.mutedStrong }}>
                      {att.status === 'verspaetet' ? `${att.late_minutes ?? '–'} Min.` : att.excused ? 'entschuldigt' : 'unentschuldigt'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '0 18px 16px', fontSize: 12.5, color: colors.mutedStrong }}>Keine Verspätungen oder Fehlstunden.</div>
        )}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${colors.borderCard}`, borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '14px 18px 10px', font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>SCHRIFTLICHE LEISTUNGEN</div>
        <div style={{ overflowX: 'auto' }}>
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
                  <td style={{ padding: '11px 12px', borderBottom: `1px solid ${colors.divider}`, font: `500 11.5px ${fonts.mono}`, color: colors.mutedStrong }}>{formatShortDate(w.date).label}</td>
                  <td style={{ padding: '11px 12px', borderBottom: `1px solid ${colors.divider}`, fontSize: 12, color: colors.mutedStrong }}>{w.content}</td>
                  <td style={{ padding: '11px 18px', borderBottom: `1px solid ${colors.divider}`, textAlign: 'center' }}>
                    <span style={{ font: `600 12.5px ${fonts.mono}`, padding: '4px 9px', borderRadius: 99, background: '#f2efe9', color: grade ? gradeColor(v) : colors.faint }}>{grade ? gradeLabel(grade) : '–'}</span>
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

      {/* The full class-style matrix, scoped to this one student — kept for the
          per-lesson grades and manual-override editing the compact overview
          above deliberately leaves out. Folded away by default so it doesn't
          reintroduce the "klobig" wall of columns as the first thing you see. */}
      <CollapsibleSection title="AUSFÜHRLICHE NOTENÜBERSICHT" collapsed={collapsed.detail} onToggle={() => toggleSection('detail')}>
        {/* Notenuebersicht's own root relies on flex:1/minHeight:0 to size
            its scrollable table against a bounded flex ancestor — without
            one, the surrounding overflow:hidden card clips it instead of
            growing to fit. A fixed height with room to spare is more reliable
            than trying to measure the header + single data row. */}
        <div style={{ height: 420, display: 'flex', flexDirection: 'column' }}>
          <Notenuebersicht bundle={soloBundle} onRefresh={onRefresh} onOpenStudent={noop} onOpenLesson={onOpenLesson} onOpenWork={onOpenWork} allowGradeOverride arrowNav={false} />
        </div>
      </CollapsibleSection>
    </div>
  );
}
