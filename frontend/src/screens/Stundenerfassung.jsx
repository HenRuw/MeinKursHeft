import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';
import { sortStudents, studentDisplayName } from '../lib/gradeMath.js';
import { formatShortDate, todayISO } from '../lib/dates.js';
import { generateOccurrenceDates, quarterForDate, DAY_ORDER } from '../lib/recurrence.js';
import SplitKeys from '../components/SplitKeys.jsx';
import RemarkPicker from '../components/RemarkPicker.jsx';
import Popover from '../components/Popover.jsx';
import ScrollWheel from '../components/ScrollWheel.jsx';

const ATTENDANCE_OPTIONS = [
  ['anwesend', 'A', 'Anwesend', colors.green],
  ['verspaetet', 'V', 'Verspätet', '#d8a02a'],
  ['fehlt', 'F', 'Fehlt', colors.red],
];

const FREQ_OPTIONS = [
  ['w', 'Wochen'],
  ['t', 'Tage'],
  ['m', 'Monate'],
];

const END_MODE_OPTIONS = [
  ['never', 'nie'],
  ['date', 'am Datum'],
  ['count', 'nach Anzahl'],
];

function Stepper({ value, onChange, min = 1, max = 30, suffix = '' }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${colors.goldBorder}`, background: colors.goldBg, borderRadius: 99, padding: '2px 4px' }}>
      <button onClick={() => onChange(Math.max(min, value - 1))} style={{ width: 20, height: 20, color: colors.gold, fontWeight: 700 }}>
        −
      </button>
      <span style={{ font: `600 11.5px ${fonts.mono}`, color: colors.gold, minWidth: 30, textAlign: 'center' }}>
        {value}
        {suffix}
      </span>
      <button onClick={() => onChange(Math.min(max, value + 1))} style={{ width: 20, height: 20, color: colors.gold, fontWeight: 700 }}>
        +
      </button>
    </span>
  );
}

export default function Stundenerfassung({ bundle, onRefresh, onOpenStudent, presets, onRefreshPresets }) {
  const quarters = [...bundle.quarters].sort((a, b) => a.idx - b.idx);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const addBtnRef = useRef(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newDate, setNewDate] = useState(todayISO());
  const [newDuration, setNewDuration] = useState(1);
  const [newTopic, setNewTopic] = useState('');
  const [repeatOn, setRepeatOn] = useState(false);
  const [repInterval, setRepInterval] = useState(1);
  const [repFreq, setRepFreq] = useState('w');
  const [repDays, setRepDays] = useState([]);
  const [repEndMode, setRepEndMode] = useState('count');
  const [repEndDate, setRepEndDate] = useState('');
  const [repEndCount, setRepEndCount] = useState(10);
  const editAnchorRef = useRef(null);
  const [editLessonId, setEditLessonId] = useState(null);
  const [editTopic, setEditTopic] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState('');

  const allLessons = [...bundle.lessons].sort((a, b) => a.date.localeCompare(b.date));

  useEffect(() => {
    if (!allLessons.some((l) => l.id === activeLessonId)) {
      const today = todayISO();
      const byToday = allLessons.find((l) => l.date === today);
      setActiveLessonId(byToday ? byToday.id : allLessons.length ? allLessons[allLessons.length - 1].id : null);
    }
  }, [allLessons.map((l) => l.id).join(',')]);

  const lesson = bundle.lessons.find((l) => l.id === activeLessonId) || null;
  const students = sortStudents(bundle.students);

  const resetAddForm = () => {
    setAddOpen(false);
    setNewTopic('');
    setRepeatOn(false);
    setRepInterval(1);
    setRepFreq('w');
    setRepDays([]);
    setRepEndMode('count');
    setRepEndDate('');
    setRepEndCount(10);
  };

  const toggleRepeat = () => {
    const next = !repeatOn;
    setRepeatOn(next);
    if (next) {
      if (!repDays.length) {
        const dow = new Date(`${newDate}T00:00:00`).getDay();
        setRepDays([DAY_ORDER[dow === 0 ? 6 : dow - 1]]);
      }
      if (!repEndDate) {
        const q = quarterForDate(quarters, newDate);
        if (q) setRepEndDate(q.end_date);
      }
    }
  };

  const toggleRepDay = (day) => {
    setRepDays((cur) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day]));
  };

  const previewDates = repeatOn
    ? generateOccurrenceDates({
        startDate: newDate,
        interval: repInterval,
        freq: repFreq,
        weekdays: repDays,
        endMode: repEndMode,
        endDate: repEndDate,
        endCount: repEndCount,
      })
    : newDate
    ? [newDate]
    : [];

  const createLesson = async () => {
    if (!newDate || !previewDates.length) return;
    const results = await Promise.all(
      previewDates.map((date) => {
        const quarter = quarterForDate(quarters, date);
        if (!quarter) return null;
        return api.createLesson(bundle.course.id, {
          quarterId: quarter.id,
          date,
          durationHours: newDuration,
          topic: newTopic.trim(),
        });
      })
    );
    const created = results.filter(Boolean);
    resetAddForm();
    await onRefresh();
    if (created.length) setActiveLessonId(created[created.length - 1].id);
  };

  const openEdit = (l, el) => {
    editAnchorRef.current = el;
    setEditLessonId(l.id);
    setEditTopic(l.topic);
    setEditContent(l.content);
    setEditNote(l.note);
    setEditDate(l.date);
  };

  const saveEdit = async () => {
    await api.updateLesson(editLessonId, { topic: editTopic, content: editContent, note: editNote, date: editDate });
    setEditLessonId(null);
    onRefresh();
  };

  const deleteLesson = async () => {
    await api.deleteLesson(editLessonId);
    setEditLessonId(null);
    setActiveLessonId(null);
    onRefresh();
  };

  const attendanceFor = (studentId) => lesson?.attendance.find((a) => a.student_id === studentId);
  const gradeFor = (studentId) => lesson?.grades.find((g) => g.student_id === studentId)?.grade || null;
  const remarksFor = (studentId) => lesson?.remarks.filter((r) => r.student_id === studentId) || [];

  const setStatus = (studentId, status) => {
    api.setAttendance(activeLessonId, studentId, { status }).then(() => {
      if (status === 'fehlt') api.setGrade(activeLessonId, studentId, null).then(onRefresh);
      else onRefresh();
    });
  };

  const setLateMinutes = (studentId, minutes) => api.setAttendance(activeLessonId, studentId, { lateMinutes: minutes }).then(onRefresh);
  const setExcused = (studentId, excused) => api.setAttendance(activeLessonId, studentId, { excused }).then(onRefresh);
  const setGrade = (studentId, grade) => api.setGrade(activeLessonId, studentId, grade).then(onRefresh);

  const addPreset = (studentId) => (preset) =>
    api.createRemark({ targetType: 'lesson', targetId: activeLessonId, studentId, emoji: preset.emoji, text: preset.text }).then(onRefresh);
  const addCustom = (studentId) => ({ emoji, text }, remember) => {
    api.createRemark({ targetType: 'lesson', targetId: activeLessonId, studentId, emoji, text }).then(onRefresh);
    if (remember) api.createRemarkPreset({ emoji, text }).then(onRefreshPresets);
  };
  const updateRemark = (id, patch) => api.updateRemark(id, patch).then(onRefresh);
  const deleteRemark = (id) => api.deleteRemark(id).then(onRefresh);
  const deletePreset = (id) => api.deleteRemarkPreset(id).then(onRefreshPresets);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 9, padding: '16px 24px', borderBottom: `1px solid ${colors.border}`, overflowX: 'auto' }}>
        {allLessons.map((l) => {
          const { dow, label: dayLabel } = formatShortDate(l.date);
          const on = l.id === activeLessonId;
          return (
            <span key={l.id} style={{ position: 'relative', flex: 'none' }}>
              <button
                onClick={() => setActiveLessonId(l.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  padding: '12px 14px 11px',
                  width: 96,
                  height: 84,
                  borderRadius: 10,
                  border: `1px solid ${on ? colors.teal : colors.borderCard}`,
                  background: on ? colors.teal : '#fff',
                  color: on ? '#fff' : colors.ink,
                }}
              >
                <span style={{ fontSize: 10.5, letterSpacing: '.08em', opacity: 0.6 }}>{dow}</span>
                <span style={{ font: `600 18px ${fonts.mono}` }}>{dayLabel}</span>
                <span style={{ fontSize: 10.5, marginTop: 2, maxWidth: 74, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? 'rgba(255,255,255,.72)' : '#9a958b' }}>
                  {l.topic || ' '}
                </span>
              </button>
              <button
                onClick={(e) => openEdit(l, e.currentTarget)}
                title="Termin bearbeiten"
                style={{
                  position: 'absolute',
                  top: 5,
                  right: 5,
                  width: 22,
                  height: 22,
                  borderRadius: 99,
                  fontSize: 12.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${on ? 'rgba(255,255,255,.55)' : colors.borderStrong}`,
                  background: on ? 'rgba(255,255,255,.22)' : '#efece5',
                  color: on ? '#fff' : '#4b5c58',
                }}
              >
                ⚙
              </button>
            </span>
          );
        })}
        <button
          ref={addBtnRef}
          onClick={() => setAddOpen((v) => !v)}
          style={{
            width: 96,
            height: 84,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px dashed ${addOpen ? colors.teal : colors.borderStrong}`,
            borderRadius: 10,
            fontSize: 24,
            fontWeight: 300,
            color: addOpen ? colors.teal : colors.muted,
            background: addOpen ? colors.tealTint : 'transparent',
          }}
        >
          +
        </button>
      </div>

      <Popover open={editLessonId != null} anchorRef={editAnchorRef} onClose={() => setEditLessonId(null)} width={280}>
        <div
          style={{
            background: '#fff',
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(0,0,0,.18)',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>TERMIN BEARBEITEN</span>
            <button onClick={() => setEditLessonId(null)} style={{ fontSize: 13, color: colors.muted }}>
              ✕
            </button>
          </div>
          <input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} placeholder="Titel" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <textarea rows={2} value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder="Stundeninhalt …" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, resize: 'vertical' }} />
          <textarea rows={2} value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Bemerkung zur Stunde …" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, resize: 'vertical' }} />
          <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={deleteLesson} style={{ padding: '8px 12px', border: `1px solid ${colors.redBorder}`, borderRadius: 7, fontSize: 12, fontWeight: 500, color: colors.red, background: colors.redBg }}>
              Löschen
            </button>
            <button onClick={saveEdit} style={{ padding: '8px 15px', borderRadius: 7, background: colors.teal, color: '#fff', fontSize: 12, fontWeight: 500 }}>
              Speichern
            </button>
          </div>
        </div>
      </Popover>

      <Popover open={addOpen} anchorRef={addBtnRef} onClose={resetAddForm} align="right" width={296}>
        <div
          style={{
            background: '#fff',
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 12,
            boxShadow: '0 14px 34px rgba(0,0,0,.18)',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>NEUER TERMIN</span>
            <button onClick={resetAddForm} style={{ fontSize: 13, color: colors.muted }}>
              ✕
            </button>
          </div>
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: colors.mutedStrong }}>Länge</span>
            <Stepper value={newDuration} onChange={setNewDuration} min={1} max={6} suffix=" Std." />
          </div>
          <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Thema (optional)" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />

          <span style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 11, borderTop: `1px solid ${colors.divider}`, marginTop: 2 }}>
            <button
              onClick={toggleRepeat}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                font: "600 12px 'IBM Plex Sans',sans-serif",
                lineHeight: '20px',
                border: `1px solid ${repeatOn ? colors.teal : '#d5cfc3'}`,
                background: repeatOn ? colors.teal : '#fff',
                color: '#fff',
              }}
            >
              {repeatOn ? '✓' : ' '}
            </button>
            <span style={{ fontSize: 12.5, color: colors.mutedStrong }}>Wiederkehrender Termin</span>
          </span>

          {repeatOn && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 11, background: colors.cream, border: `1px solid ${colors.divider}`, borderRadius: 9 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: colors.mutedStrong }}>Alle</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={repInterval}
                  onChange={(e) => setRepInterval(Math.max(1, Number(e.target.value) || 1))}
                  style={{ width: 52, padding: '6px 8px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, font: `600 12.5px ${fonts.mono}`, textAlign: 'center' }}
                />
                <select
                  value={repFreq}
                  onChange={(e) => setRepFreq(e.target.value)}
                  style={{ flex: 1, padding: '6px 8px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, background: '#fff' }}
                >
                  {FREQ_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </span>

              {repFreq === 'w' && (
                <span style={{ display: 'flex', gap: 5 }}>
                  {DAY_ORDER.map((day) => {
                    const on = repDays.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleRepDay(day)}
                        style={{
                          flex: 1,
                          height: 30,
                          borderRadius: 99,
                          font: `600 11px ${fonts.mono}`,
                          border: `1px solid ${on ? colors.teal : colors.borderCard}`,
                          background: on ? colors.teal : '#fff',
                          color: on ? '#fff' : colors.muted,
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </span>
              )}

              <span style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 3 }}>
                <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>ENDET</span>
                <span style={{ display: 'flex', gap: 5 }}>
                  {END_MODE_OPTIONS.map(([value, label]) => {
                    const on = repEndMode === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setRepEndMode(value)}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          borderRadius: 7,
                          fontSize: 11.5,
                          fontWeight: 500,
                          border: `1px solid ${on ? colors.teal : colors.borderCard}`,
                          background: on ? colors.tealTint : '#fff',
                          color: on ? colors.teal : colors.mutedStrong,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </span>
                {repEndMode === 'date' && (
                  <input type="date" value={repEndDate} onChange={(e) => setRepEndDate(e.target.value)} style={{ padding: '7px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
                )}
                {repEndMode === 'count' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      min={1}
                      max={366}
                      value={repEndCount}
                      onChange={(e) => setRepEndCount(Math.max(1, Number(e.target.value) || 1))}
                      style={{ width: 62, padding: '7px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, font: `600 12.5px ${fonts.mono}`, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 12, color: colors.mutedStrong }}>Termine</span>
                  </span>
                )}
              </span>

              <span style={{ fontSize: 11.5, color: colors.muted }}>
                {previewDates.length ? `${previewDates.length} Termin${previewDates.length === 1 ? '' : 'e'} werden angelegt` : 'Keine Termine für diese Auswahl'}
              </span>
            </div>
          )}

          <button
            onClick={createLesson}
            disabled={!previewDates.length}
            style={{ padding: '9px', borderRadius: 8, background: previewDates.length ? colors.teal : colors.divider, color: previewDates.length ? '#fff' : colors.faint, fontSize: 12.5, fontWeight: 500 }}
          >
            {repeatOn ? 'Serie anlegen' : 'Termin anlegen'}
          </button>
        </div>
      </Popover>

      {!lesson ? (
        <div style={{ padding: 40, color: colors.mutedStrong, fontSize: 13 }}>
          Noch keine Stunde — über „+“ eine anlegen.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '26px 168px 118px 108px 286px 1fr', alignItems: 'center', gap: 14, padding: '8px 24px', background: '#efece5', borderBottom: `1px solid ${colors.border}`, font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>
            <span>#</span>
            <span>SCHÜLER:IN</span>
            <span>ANWESENHEIT</span>
            <span />
            <span>MITARBEITSNOTE</span>
            <span>BEMERKUNG</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {students.map((s, i) => {
              const att = attendanceFor(s.id);
              const status = att?.status || 'anwesend';
              const absent = status === 'fehlt';
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '26px 168px 118px 108px 286px 1fr', alignItems: 'center', gap: 14, padding: '7px 24px', borderBottom: `1px solid ${colors.divider}` }}>
                  <span style={{ font: `500 11px ${fonts.mono}`, color: colors.faint }}>{String(i + 1).padStart(2, '0')}</span>
                  <button onClick={() => onOpenStudent(s.id, 'stunde')} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, textAlign: 'left' }}>
                    <span style={{ flex: 'none', width: 26, height: 26, borderRadius: 99, background: '#e3e8e5', color: absent ? colors.faint : colors.mutedStrong, font: `600 10px ${fonts.mono}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {s.first_name[0]}
                      {s.last_name[0]}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: absent ? colors.faint : colors.ink }}>{studentDisplayName(s)}</span>
                  </button>
                  <span style={{ display: 'flex', gap: 3 }}>
                    {ATTENDANCE_OPTIONS.map(([key, letter, title, color]) => {
                      // "Verspätet" is a sub-state of "Anwesend" (you were there,
                      // just late), so Anwesend stays highlighted alongside it.
                      const on = status === key || (key === 'anwesend' && status === 'verspaetet');
                      const onClick = () => {
                        if (key === 'verspaetet' && status === 'verspaetet') setStatus(s.id, 'anwesend');
                        else setStatus(s.id, key);
                      };
                      return (
                        <button key={key} title={title} onClick={onClick} style={{ flex: 1, padding: '5px 0', borderRadius: 6, font: `600 11px ${fonts.mono}`, border: `1px solid ${on ? color : colors.borderCard}`, background: on ? color : '#fff', color: on ? '#fff' : '#9a958b' }}>
                          {letter}
                        </button>
                      );
                    })}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {status === 'verspaetet' && (
                      <ScrollWheel value={att?.late_minutes ?? 5} onChange={(v) => setLateMinutes(s.id, v)} />
                    )}
                    {status === 'fehlt' && (
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ font: `500 8.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.04em', textTransform: 'uppercase' }}>entschuldigt</span>
                        <button
                          onClick={() => setExcused(s.id, !att?.excused)}
                          style={{ width: 26, height: 26, borderRadius: 6, font: '600 13px sans-serif', border: `1px solid ${att?.excused ? colors.green : '#d5cfc3'}`, background: att?.excused ? colors.green : '#fff', color: '#fff' }}
                        >
                          {att?.excused ? '✓' : ''}
                        </button>
                      </span>
                    )}
                  </span>
                  <span style={{ opacity: absent ? 0.4 : 1, pointerEvents: absent ? 'none' : 'auto' }}>
                    <SplitKeys value={gradeFor(s.id)} onChange={(v) => setGrade(s.id, v)} disabled={absent} />
                  </span>
                  <RemarkPicker
                    remarks={remarksFor(s.id)}
                    presets={presets}
                    onAddPreset={addPreset(s.id)}
                    onAddCustom={addCustom(s.id)}
                    onUpdateRemark={updateRemark}
                    onDeleteRemark={deleteRemark}
                    onDeletePreset={deletePreset}
                  />
                </div>
              );
            })}
            {!students.length && (
              <div style={{ padding: 24, color: colors.mutedStrong, fontSize: 13 }}>
                Noch niemand eingeschrieben — unter „Schülerverwaltung“ Schüler:innen hinzufügen.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
