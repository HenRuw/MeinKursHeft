import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';
import { sortStudents, studentDisplayName, studentKlasseLabel, formatWeight } from '../lib/gradeMath.js';
import { formatShortDate, formatLongDate, formatDateRange, todayISO } from '../lib/dates.js';
import { quarterForDate } from '../lib/recurrence.js';
import { submitOnEnter } from '../lib/keys.js';
import { triggerShake } from '../lib/shake.js';
import SplitKeys from '../components/SplitKeys.jsx';
import RemarkPicker from '../components/RemarkPicker.jsx';
import Popover from '../components/Popover.jsx';
import ScrollWheel from '../components/ScrollWheel.jsx';
import LockButton from '../components/LockButton.jsx';

const ATTENDANCE_OPTIONS = [
  ['anwesend', 'A', 'Anwesend', colors.green],
  ['verspaetet', 'V', 'Verspätet', '#d8a02a'],
  ['fehlt', 'F', 'Fehlt', colors.red],
];

// Unit tile geometry — one source of truth for the tiles and for the
// paging maths (how far a left/right-edge click scrolls the row).
const TILE_W = 152;
const TILE_H = 62;
const TILE_GAP = 9;

// End of a unit's span: a single-hour unit leaves end_date equal to date (or
// null on pre-range rows), so treat those as no range.
const unitEnd = (l) => l.end_date || l.date;
const isMultiDay = (l) => unitEnd(l) !== l.date;

// One labelled field in the unit detail panel (small mono caption above the
// value). `multiline` lets the Kommentar wrap; everything else ellipsises.
function DetailRow({ label, value, multiline }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span style={{ font: `500 8.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</span>
      <span
        style={{
          fontSize: 12,
          color: colors.ink,
          ...(multiline
            ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
            : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
        }}
      >
        {value}
      </span>
    </span>
  );
}

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

export default function Stundenerfassung({ bundle, onRefresh, onOpenStudent, presets, onRefreshPresets, initialLesson }) {
  const quarters = [...bundle.quarters].sort((a, b) => a.idx - b.idx);
  const [activeLessonId, setActiveLessonId] = useState(null);
  // The student row to highlight after arriving via a grade clicked in the
  // Notenübersicht — cleared by App itself (setFocusLesson(null)) the moment
  // you leave this tab, so a plain remount without a fresh initialLesson
  // just leaves this at its null default instead of reapplying a stale one.
  const [highlightedStudentId, setHighlightedStudentId] = useState(null);
  const addBtnRef = useRef(null);
  const tileViewportRef = useRef(null);
  const tileRefs = useRef({});
  // A freshly created unit's id, remembered so we can scroll its tile into
  // view once onRefresh has re-rendered the row and registered its ref.
  const pendingScrollRef = useRef(null);
  const setLockRef = useRef(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newDate, setNewDate] = useState(todayISO());
  const [newEndDate, setNewEndDate] = useState(todayISO());
  const [newDuration, setNewDuration] = useState(1);
  const [newTopic, setNewTopic] = useState('');
  const [newNote, setNewNote] = useState('');
  const editAnchorRef = useRef(null);
  const [editLessonId, setEditLessonId] = useState(null);
  const [editTopic, setEditTopic] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editDuration, setEditDuration] = useState(1);
  const [editWeight, setEditWeight] = useState('1');

  const allLessons = [...bundle.lessons].sort((a, b) => a.date.localeCompare(b.date));

  useEffect(() => {
    // Arriving here from a grade clicked in the Notenübersicht jumps
    // straight to that lesson, ahead of the usual "today, else most recent"
    // default — checked first and, if present, short-circuits that default
    // entirely (the token in initialLesson changes on every click, even
    // clicking the same lesson again, so this always re-fires).
    if (initialLesson != null) {
      setActiveLessonId(initialLesson.id);
      setHighlightedStudentId(initialLesson.highlightStudentId ?? null);
      return;
    }
    if (!allLessons.some((l) => l.id === activeLessonId)) {
      const today = todayISO();
      const byToday = allLessons.find((l) => l.date === today);
      setActiveLessonId(byToday ? byToday.id : allLessons.length ? allLessons[allLessons.length - 1].id : null);
    }
  }, [initialLesson, allLessons.map((l) => l.id).join(',')]);

  const lesson = bundle.lessons.find((l) => l.id === activeLessonId) || null;
  const students = sortStudents(bundle.students);

  // The detail panel widens as the Kommentar grows, so a long comment wraps
  // to fewer lines instead of a tall, narrow column — clamped so it never
  // eats the space the tile row needs to keep at least three tiles visible.
  const detailWidth = Math.round(Math.min(440, 280 + Math.max(0, (lesson?.note || '').length - 40) * 1.4));

  const resetAddForm = () => {
    setAddOpen(false);
    setNewTopic('');
    setNewNote('');
    setNewDuration(1);
    setNewDate(todayISO());
    setNewEndDate(todayISO());
  };

  const createLesson = async () => {
    if (!newDate) return;
    const quarter = quarterForDate(quarters, newDate);
    if (!quarter) return;
    // A multi-Schulstunden unit spans von (newDate) … bis (newEndDate); a
    // single hour collapses bis onto von. Weight tracks the hour count.
    const endDate = newDuration > 1 && newEndDate >= newDate ? newEndDate : newDate;
    const created = await api.createLesson(bundle.course.id, {
      quarterId: quarter.id,
      date: newDate,
      endDate,
      durationHours: newDuration,
      topic: newTopic.trim(),
      note: newNote.trim(),
      weight: newDuration,
    });
    resetAddForm();
    // Remember the new unit *before* refreshing: onRefresh's re-render is what
    // renders the tile and fires the scroll effect, so the id has to be set by
    // then (setActiveLessonId afterwards doesn't change that effect's deps).
    pendingScrollRef.current = created.id;
    await onRefresh();
    setActiveLessonId(created.id);
  };

  const openEdit = (l, el) => {
    editAnchorRef.current = el;
    setEditLessonId(l.id);
    setEditTopic(l.topic);
    setEditContent(l.content);
    setEditNote(l.note);
    setEditDate(l.date);
    setEditEndDate(unitEnd(l));
    setEditDuration(l.duration_hours);
    setEditWeight(formatWeight(l.weight));
  };

  // Changing the Schulstunden count in the editor re-syncs the weight to the
  // new hour count (same rule as when the unit was created); you can still
  // override the weight afterwards in this same form or in the Notenübersicht.
  const changeEditDuration = (v) => {
    setEditDuration(v);
    setEditWeight(formatWeight(v));
  };

  const saveEdit = async () => {
    const endDate = editDuration > 1 && editEndDate >= editDate ? editEndDate : editDate;
    const w = parseFloat(String(editWeight).replace(',', '.'));
    await api.updateLesson(editLessonId, {
      topic: editTopic,
      content: editContent,
      note: editNote,
      date: editDate,
      endDate,
      durationHours: editDuration,
      weight: Number.isFinite(w) && w > 0 ? w : editDuration,
    });
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

  // Whole-set lock (Notensatz): a locked set disables and governs every grade
  // in this lesson. Individual grades are not lockable on their own.
  const setLocked = !!lesson?.grades_locked;
  const toggleSetLock = () => api.updateLesson(activeLessonId, { gradesLocked: !setLocked }).then(onRefresh);

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

  // --- unit tile row: scrolling + edge-click paging ---
  // Centre a unit's tile in the viewport — used when clicking empty space in
  // the detail panel to jump the row back to the unit it describes.
  const scrollToLesson = (id) => {
    const vp = tileViewportRef.current;
    const el = tileRefs.current[id];
    if (!vp || !el) return;
    const delta = el.getBoundingClientRect().left - vp.getBoundingClientRect().left;
    const target = vp.scrollLeft + delta - (vp.clientWidth - el.offsetWidth) / 2;
    vp.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  };

  // Once a newly created unit's tile has actually rendered (its ref is
  // registered), scroll it into view and forget the pending id.
  useEffect(() => {
    const id = pendingScrollRef.current;
    if (id != null && tileRefs.current[id]) {
      scrollToLesson(id);
      pendingScrollRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLessons.map((l) => l.id).join(',')]);

  // Clicking any tile — including one flush against the left/right edge of
  // the row — just selects that unit. Moving through the list is done by
  // swiping or the scrollbar, not by clicking the edge tiles.
  const onTileClick = (l) => setActiveLessonId(l.id);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '16px 24px', borderBottom: `1px solid ${colors.border}` }}>
        {/* Detail panel (left): the selected unit's Von…bis, Gewicht,
            Schulstunden, Thema and Kommentar. The date/Gewicht/Schulstunden
            fields sit on one wrapping row so the block stays short and wide
            rather than a tall column. Clicking empty space in it scrolls the
            tile row back to that unit; the pencil in the top-right corner
            opens the editor (the old per-tile gear button is gone). */}
        <div
          onClick={() => activeLessonId && scrollToLesson(activeLessonId)}
          style={{
            position: 'relative',
            flex: 'none',
            width: detailWidth,
            transition: 'width 160ms ease',
            minHeight: TILE_H,
            padding: '8px 13px',
            borderRadius: 10,
            border: `1px solid ${colors.borderCard}`,
            background: colors.cream,
            cursor: lesson ? 'pointer' : 'default',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {lesson ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(lesson, e.currentTarget);
                }}
                title="Einheit bearbeiten"
                style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, background: '#fff', color: colors.mutedStrong, fontSize: 13 }}
              >
                ✎
              </button>
              {/* Two aligned columns across both rows -- date | Schulstunden
                  and Thema | Kommentar -- so Schulstunden and Kommentar start
                  at the same x. The matching paddingRight on both rows keeps
                  the split identical and the right column clear of the pencil. */}
              <div style={{ display: 'flex', gap: 16, paddingRight: 30 }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 16 }}>
                  {isMultiDay(lesson) ? (
                    <>
                      <DetailRow label="von" value={formatLongDate(lesson.date)} />
                      <DetailRow label="bis" value={formatLongDate(unitEnd(lesson))} />
                    </>
                  ) : (
                    <DetailRow label="Datum" value={formatLongDate(lesson.date)} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DetailRow label="Schulstunden" value={String(lesson.duration_hours)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, paddingRight: 30 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DetailRow label="Thema" value={lesson.topic || '—'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DetailRow label="Kommentar" value={lesson.note || '—'} multiline />
                </div>
              </div>
            </>
          ) : (
            <span style={{ fontSize: 12, color: colors.muted }}>Keine Einheit ausgewählt.</span>
          )}
        </div>

        {/* "+" tile: pinned as far left as possible in the unit row — left of
            the tile viewport so it never scrolls away and sits right at the
            start when there are no units yet. */}
        <button
          ref={addBtnRef}
          onClick={() => setAddOpen((v) => !v)}
          title="Neue Einheit"
          style={{
            width: 56,
            minHeight: TILE_H,
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

        {/* Tile row (middle): scrolls/swipes horizontally, at least three
            tiles visible on a normal window. Clicking the tile at the very
            left/right edge pages the row (see onTileClick). */}
        <div
          ref={tileViewportRef}
          className="scroll-panel"
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'stretch', gap: TILE_GAP, overflowX: 'auto', scrollSnapType: 'x proximity', paddingBottom: 2 }}
        >
          {allLessons.map((l) => {
            const on = l.id === activeLessonId;
            const period = isMultiDay(l) ? formatDateRange(l.date, unitEnd(l)) : formatShortDate(l.date).label;
            return (
              <button
                key={l.id}
                ref={(el) => {
                  if (el) tileRefs.current[l.id] = el;
                  else delete tileRefs.current[l.id];
                }}
                onClick={() => onTileClick(l)}
                style={{
                  flex: 'none',
                  width: TILE_W,
                  minHeight: TILE_H,
                  scrollSnapAlign: 'start',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${on ? colors.teal : colors.borderCard}`,
                  background: on ? colors.teal : '#fff',
                  color: on ? '#fff' : colors.ink,
                  textAlign: 'left',
                }}
              >
                <span style={{ font: `600 15px ${fonts.mono}` }}>{period}</span>
                <span style={{ fontSize: 10.5, color: on ? 'rgba(255,255,255,.72)' : colors.muted }}>{l.duration_hours} Schulstd.</span>
                <span style={{ fontSize: 11, maxWidth: TILE_W - 26, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? 'rgba(255,255,255,.85)' : '#6c7a76' }}>
                  {l.topic || ' '}
                </span>
              </button>
            );
          })}
          {!allLessons.length && (
            <span style={{ alignSelf: 'center', fontSize: 12.5, color: colors.mutedStrong, paddingLeft: 4 }}>Noch keine Einheit — links über „+“ anlegen.</span>
          )}
        </div>
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
            <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>EINHEIT BEARBEITEN</span>
            <button onClick={() => setEditLessonId(null)} style={{ fontSize: 13, color: colors.muted }}>
              ✕
            </button>
          </div>
          <input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} onKeyDown={submitOnEnter(saveEdit)} placeholder="Thema" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: colors.mutedStrong }}>Länge</span>
            <Stepper value={editDuration} onChange={changeEditDuration} min={1} max={12} />
            <span style={{ fontSize: 12, color: colors.mutedStrong }}>Schulstunden</span>
          </div>
          {editDuration > 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 30, fontSize: 12, color: colors.mutedStrong }}>von:</span>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => { setEditDate(e.target.value); if (editEndDate < e.target.value) setEditEndDate(e.target.value); }}
                  onKeyDown={submitOnEnter(saveEdit)}
                  style={{ flex: 1, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 30, fontSize: 12, color: colors.mutedStrong }}>bis:</span>
                <input
                  type="date"
                  value={editEndDate}
                  min={editDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  onKeyDown={submitOnEnter(saveEdit)}
                  style={{ flex: 1, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }}
                />
              </label>
            </div>
          ) : (
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} onKeyDown={submitOnEnter(saveEdit)} style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: colors.mutedStrong }}>Gewicht</span>
            <input
              value={editWeight}
              onChange={(e) => setEditWeight(e.target.value)}
              onKeyDown={submitOnEnter(saveEdit)}
              inputMode="decimal"
              style={{ width: 70, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }}
            />
          </label>
          <textarea rows={2} value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={submitOnEnter(saveEdit)} placeholder="Stundeninhalt …" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, resize: 'vertical' }} />
          <textarea rows={2} value={editNote} onChange={(e) => setEditNote(e.target.value)} onKeyDown={submitOnEnter(saveEdit)} placeholder="Kommentar …" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, resize: 'vertical' }} />
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

      <Popover open={addOpen} anchorRef={addBtnRef} onClose={resetAddForm} align="left" width={296}>
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
            <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>NEUE STUNDE</span>
            <button onClick={resetAddForm} style={{ fontSize: 13, color: colors.muted }}>
              ✕
            </button>
          </div>
          {/* Length first (in Schulstunden), then the date bar: a single
              date for a one-hour unit, or a von … bis range once it spans
              more than one Schulstunde. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: colors.mutedStrong }}>Länge</span>
            <Stepper value={newDuration} onChange={setNewDuration} min={1} max={12} />
            <span style={{ fontSize: 12, color: colors.mutedStrong }}>Schulstunden</span>
          </div>
          {newDuration > 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 30, fontSize: 12, color: colors.mutedStrong }}>von:</span>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => { setNewDate(e.target.value); if (newEndDate < e.target.value) setNewEndDate(e.target.value); }}
                  onKeyDown={submitOnEnter(createLesson)}
                  style={{ flex: 1, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 30, fontSize: 12, color: colors.mutedStrong }}>bis:</span>
                <input
                  type="date"
                  value={newEndDate}
                  min={newDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  onKeyDown={submitOnEnter(createLesson)}
                  style={{ flex: 1, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }}
                />
              </label>
            </div>
          ) : (
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} onKeyDown={submitOnEnter(createLesson)} style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          )}
          <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyDown={submitOnEnter(createLesson)} placeholder="Thema (optional)" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <textarea rows={2} value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={submitOnEnter(createLesson)} placeholder="Kommentar (optional)" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, resize: 'vertical' }} />

          <button
            onClick={createLesson}
            disabled={!newDate}
            style={{ padding: '9px', borderRadius: 8, background: newDate ? colors.teal : colors.divider, color: newDate ? '#fff' : colors.faint, fontSize: 12.5, fontWeight: 500 }}
          >
            {newDuration > 1 ? 'Stunden anlegen' : 'Stunde anlegen'}
          </button>
        </div>
      </Popover>

      {!lesson ? (
        <div style={{ padding: 40, color: colors.mutedStrong, fontSize: 13 }}>
          Noch keine Stunde — über „+“ eine anlegen.
        </div>
      ) : (
        // One shared horizontal+vertical scroll container for header and
        // rows together (rather than two separate scrollers) — on a narrow
        // screen this row simply doesn't fit, so it needs to scroll
        // sideways, and the header only stays aligned with the columns
        // beneath it if both scroll as one. The "#" and name columns stay
        // pinned via position:sticky (offset by the row's own 24px padding,
        // since sticky's `left` is measured from the scrollport edge, not
        // from the row's padding box) so a student stays identifiable while
        // swiping right to reach attendance/grade/remarks.
        <div className="scroll-panel" style={{ flex: 1, overflow: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '26px 168px 118px 108px 356px 1fr',
              alignItems: 'center',
              gap: 14,
              padding: '8px 24px',
              background: '#efece5',
              borderBottom: `1px solid ${colors.border}`,
              font: `500 9.5px ${fonts.mono}`,
              color: colors.muted,
              letterSpacing: '.09em',
              position: 'sticky',
              top: 0,
              zIndex: 3,
              minWidth: 'max-content',
            }}
          >
            <span style={{ position: 'sticky', left: 24, background: '#efece5' }}>#</span>
            <span style={{ position: 'sticky', left: 64, background: '#efece5' }}>SCHÜLER:IN</span>
            <span>ANWESENHEIT</span>
            <span />
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: -14 }}>
              MITARBEITSNOTE
              <span ref={setLockRef} style={{ display: 'inline-flex' }}>
                <LockButton
                  locked={setLocked}
                  onClick={toggleSetLock}
                  size={20}
                  title={setLocked ? 'Notensatz entsperren' : 'Ganzen Notensatz sperren'}
                />
              </span>
              {setLocked && <span style={{ color: colors.gold, letterSpacing: 0 }}>GESPERRT</span>}
            </span>
            <span>BEMERKUNG</span>
          </div>
          {students.map((s, i) => {
              const att = attendanceFor(s.id);
              const status = att?.status || 'anwesend';
              const absent = status === 'fehlt';
              // The row a grade was clicked for, coming from the
              // Notenübersicht — see highlightedStudentId's own comment.
              const highlighted = s.id === highlightedStudentId;
              const rowBg = highlighted ? colors.highlightBg : undefined;
              // Opaque backing for the pinned "#"/name columns so the
              // sideways-scrolling attendance/grade/remark cells can't show
              // through the transparent grid gaps or paint over them. Shadows
              // fill the 24px left padding, the 14px gap before the name and
              // the 14px gap after it.
              const pinnedBg = rowBg ?? colors.panelBg;
              return (
                <div
                  key={s.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '26px 168px 118px 108px 356px 1fr',
                    alignItems: 'center',
                    gap: 14,
                    padding: '7px 24px',
                    borderBottom: `1px solid ${colors.divider}`,
                    borderLeft: `4px solid ${highlighted ? colors.highlight : 'transparent'}`,
                    background: rowBg,
                    minWidth: 'max-content',
                  }}
                >
                  <span style={{ position: 'sticky', left: 24, zIndex: 2, background: pinnedBg, boxShadow: `-24px 0 0 0 ${pinnedBg}, 14px 0 0 0 ${pinnedBg}`, font: `500 11px ${fonts.mono}`, color: colors.faint }}>{String(i + 1).padStart(2, '0')}</span>
                  <button onClick={() => onOpenStudent(s.id, 'stunde')} style={{ position: 'sticky', left: 64, zIndex: 2, background: pinnedBg, boxShadow: `14px 0 0 0 ${pinnedBg}`, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, textAlign: 'left' }}>
                    <span style={{ flex: 'none', width: 26, height: 26, borderRadius: 99, background: '#e3e8e5', color: absent ? colors.faint : colors.mutedStrong, font: `600 10px ${fonts.mono}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {s.first_name[0]}
                      {s.last_name[0]}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: absent ? colors.faint : colors.ink }}>{studentDisplayName(s)}</span>
                      {studentKlasseLabel(s) && <span style={{ fontSize: 10, fontWeight: 500, color: colors.muted }}>{studentKlasseLabel(s)}</span>}
                    </span>
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
                  <span onClick={setLocked ? () => triggerShake(setLockRef.current) : undefined} style={{ marginLeft: -14 }}>
                    <SplitKeys value={gradeFor(s.id)} onChange={(v) => setGrade(s.id, v)} disabled={setLocked} />
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
      )}
    </div>
  );
}
