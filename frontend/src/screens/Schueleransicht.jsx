import { useState } from 'react';
import { colors, fonts } from '../theme.js';
import { num, fmt, gradeColor, gradeLabel, studentDisplayName, studentKlasseLabel, WRITTEN_WORK_KINDS, writtenWorkKindLabel } from '../lib/gradeMath.js';
import { formatShortDate } from '../lib/dates.js';
import { usePersisted } from '../lib/usePersisted.js';
import { useViewport } from '../lib/useViewport.js';
import GradeLineChart from '../components/GradeLineChart.jsx';
import Notenuebersicht from './Notenuebersicht.jsx';

function Kpi({ label, value, note, strong, valueColor }) {
  return (
    <div style={{ background: strong ? colors.sidebarBg : '#fff', border: `1px solid ${strong ? colors.sidebarBg : colors.borderCard}`, borderRadius: 11, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ font: `500 9.5px ${fonts.mono}`, color: strong ? '#9fb0ab' : colors.muted, letterSpacing: '.09em' }}>{label}</span>
      <span style={{ font: `500 26px/1 ${fonts.serif}`, color: valueColor || (strong ? '#fff' : colors.ink) }}>{value}</span>
      <span style={{ fontSize: 11.5, color: strong ? '#9fb0ab' : colors.muted }}>{note}</span>
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
          <span style={{ display: 'inline-block', fontSize: 9, color: colors.muted, transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 120ms ease' }}>▾</span>
          <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>{title}</span>
        </button>
        {!collapsed && headerExtra}
      </div>
      {!collapsed && children}
    </div>
  );
}

const ATTENDANCE_TABLE_HEADERS = ['DATUM', 'THEMA', 'ART', 'DETAIL'];

export default function Schueleransicht({ bundle, studentId, onRefresh, onBack, onOpenLesson, onOpenWork }) {
  const { isMobile } = useViewport();
  const student = bundle.students.find((s) => s.id === studentId);
  const quarters = [...bundle.quarters].sort((a, b) => a.idx - b.idx);

  const [selectedQuarterIds, setSelectedQuarterIds] = useState(() => quarters.map((q) => q.id));
  const [examKind, setExamKind] = useState('klassenarbeit');
  const [collapsed, setCollapsed] = usePersisted(`schueleransicht:${studentId}:collapsed`, {
    grades: false,
    lessonsChart: false,
    examsChart: false,
  });

  if (!student) return null;

  const toggleQuarter = (id) =>
    setSelectedQuarterIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleSection = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const allLessons = bundle.lessons;

  // The detailed grade breakdown above is the exact same nested
  // Mitarbeit/Schriftlich/Quartal/Halbjahr layout as the course-wide
  // Notenübersicht — reusing that component with a bundle scoped to just
  // this one student guarantees the numbers can never drift apart, and a
  // synthetic course id keeps its collapse/scope preferences (localStorage)
  // isolated from the real Notenübersicht and from other students' pages.
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
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: isMobile ? '0 14px 28px' : '0 24px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* The name + Zurück-Pfeil bar stays pinned to the top while the long
          student page scrolls underneath. Its background matches the page so
          scrolled content can't show through, and the container's top padding
          moved here so it sticks flush at top:0. */}
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
          padding: isMobile ? '16px 0 12px' : '20px 0 12px',
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px 7px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 8, background: '#fff', color: colors.mutedStrong, fontSize: 12.5 }}>
          ‹ Zurück
        </button>
        <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 99, background: colors.sidebarBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `500 15px ${fonts.sans}` }}>
          {student.first_name[0]}
          {student.last_name[0]}
        </span>
        <span style={{ font: `500 21px/1.1 ${fonts.serif}` }}>{studentDisplayName(student)}</span>
        {studentKlasseLabel(student) && (
          <span style={{ font: `500 12px ${fonts.mono}`, padding: '3px 9px', borderRadius: 99, background: colors.tealTint, color: colors.teal }}>{studentKlasseLabel(student)}</span>
        )}
      </div>

      <CollapsibleSection title="NOTENÜBERSICHT" collapsed={collapsed.grades} onToggle={() => toggleSection('grades')}>
        {/* Notenuebersicht's own root relies on flex:1/minHeight:0 to size
            its scrollable table against a bounded flex ancestor — without
            one, the surrounding overflow:hidden card clips it instead of
            growing to fit. The header (year/half/quarter/mitarbeit-
            schriftlich/kind/title) plus this one data row needs ~330px
            regardless of the course's data, so a fixed height here with
            room to spare is more reliable than trying to measure it. */}
        <div style={{ height: 420, display: 'flex', flexDirection: 'column' }}>
          <Notenuebersicht bundle={soloBundle} onRefresh={onRefresh} onOpenStudent={noop} onOpenLesson={onOpenLesson} onOpenWork={onOpenWork} allowGradeOverride />
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
        <div style={{ padding: '14px 18px 10px', font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>ANWESENHEIT</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, padding: '0 18px 16px' }}>
          <Kpi label="VERSPÄTUNGEN" value={lateEntries.length} note="Einzelstunden" />
          <Kpi label="FEHLSTUNDEN" value={absentEntries.length} note="Einzelstunden" />
          <Kpi label="DAVON UNENTSCHULDIGT" value={unexcusedEntries.length} note="Einzelstunden" valueColor={unexcusedEntries.length ? colors.red : undefined} />
        </div>
        {attendanceEntries.length > 0 && (
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
                  <td style={{ padding: '10px 18px', borderBottom: `1px solid ${colors.divider}`, font: `500 11.5px ${fonts.mono}`, color: colors.mutedStrong }}>{lesson.date}</td>
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
        )}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${colors.borderCard}`, borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '14px 18px 10px', font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>KOMMENTARE AUS DEN EINZELSTUNDEN</div>
        {lessonComments.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {lessonComments.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 18px', borderTop: `1px solid ${colors.divider}` }}>
                <span style={{ font: `500 11.5px ${fonts.mono}`, color: colors.mutedStrong, flex: 'none' }}>{r.lessonDate}</span>
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
                  <td style={{ padding: '11px 12px', borderBottom: `1px solid ${colors.divider}`, font: `500 11.5px ${fonts.mono}`, color: colors.mutedStrong }}>{w.date}</td>
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
    </div>
  );
}
