import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';
import { sortStudents, studentDisplayName, studentKlasseLabel, WRITTEN_WORK_KINDS, num, fmt, wavg } from '../lib/gradeMath.js';
import { todayISO } from '../lib/dates.js';
import { quarterForDate } from '../lib/recurrence.js';
import { submitOnEnter } from '../lib/keys.js';
import { triggerShake } from '../lib/shake.js';
import { usePersisted } from '../lib/usePersisted.js';
import { useViewport } from '../lib/useViewport.js';
import SplitKeys from '../components/SplitKeys.jsx';
import RemarkPicker from '../components/RemarkPicker.jsx';
import Popover from '../components/Popover.jsx';
import LockButton from '../components/LockButton.jsx';
import CollapseArrow from '../components/CollapseArrow.jsx';
import { downloadWorkStatsImage } from '../lib/workStatsImage.js';

// WRITTEN_WORK_KINDS.label is singular (correct for "choose one kind" in a
// dropdown or a single work's badge); a section header groups many, so it
// reads more naturally in the plural.
const SECTION_LABELS = {
  klassenarbeit: 'Klassenarbeiten',
  test: 'Tests',
  sonstige: 'Sonstige Leistungen',
};

// The small round buttons in the top-right corner of a work card (statistics
// + edit); `active` tints it teal (used for the edit button while its editor
// is open). `right` is set per-button by the caller.
const cornerBtnStyle = (active) => ({
  position: 'absolute',
  top: 11,
  width: 22,
  height: 22,
  borderRadius: 99,
  fontSize: 11.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid ${active ? colors.teal : colors.borderStrong}`,
  background: active ? colors.teal : '#efece5',
  color: active ? '#fff' : '#4b5c58',
});

function BarChartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="1" y="6" width="2.4" height="5" rx="0.4" fill="currentColor" />
      <rect x="4.8" y="3" width="2.4" height="8" rx="0.4" fill="currentColor" />
      <rect x="8.6" y="7.5" width="2.4" height="3.5" rx="0.4" fill="currentColor" />
    </svg>
  );
}

export default function SchriftlicheLeistungen({ bundle, onRefresh, onOpenStudent, presets, onRefreshPresets, initialWork }) {
  const { isDesktop } = useViewport();
  const quarters = [...bundle.quarters].sort((a, b) => a.idx - b.idx);
  const [activeWorkId, setActiveWorkId] = useState(null);
  // The student row to highlight after arriving via a grade clicked in the
  // Notenübersicht — cleared by App itself (setFocusWork(null)) the moment
  // you leave this tab, so a plain remount without a fresh initialWork just
  // leaves this at its null default instead of reapplying a stale one.
  const [highlightedStudentId, setHighlightedStudentId] = useState(null);
  const addBtnRef = useRef(null);
  const setLockRef = useRef(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newKind, setNewKind] = useState('klassenarbeit');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newDate, setNewDate] = useState(todayISO());
  const editAnchorRef = useRef(null);
  const [editWorkId, setEditWorkId] = useState(null);
  const [editKind, setEditKind] = useState('klassenarbeit');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editWeight, setEditWeight] = useState('1');

  const allWorks = [...bundle.writtenWorks].sort((a, b) => a.date.localeCompare(b.date));
  const [collapsedKinds, setCollapsedKinds] = usePersisted(`schriftliche-leistungen:${bundle.course.id}:collapsed`, {});
  const toggleKindCollapsed = (kind) => setCollapsedKinds((cur) => ({ ...cur, [kind]: !cur[kind] }));

  useEffect(() => {
    // Arriving here from a grade clicked in the Notenübersicht jumps
    // straight to that work, ahead of the usual "first in the list" default
    // — checked first and, if present, short-circuits that default entirely
    // (the token in initialWork changes on every click, even clicking the
    // same work again, so this always re-fires). Its kind section is
    // un-collapsed too, so the highlighted entry is actually visible in the
    // sidebar rather than just selected behind a closed group.
    if (initialWork != null) {
      setActiveWorkId(initialWork.id);
      setHighlightedStudentId(initialWork.highlightStudentId ?? null);
      const target = bundle.writtenWorks.find((w) => w.id === initialWork.id);
      if (target) setCollapsedKinds((cur) => ({ ...cur, [target.kind]: false }));
      return;
    }
    if (!allWorks.some((w) => w.id === activeWorkId)) {
      setActiveWorkId(allWorks.length ? allWorks[0].id : null);
    }
  }, [initialWork, allWorks.map((w) => w.id).join(',')]);

  const work = bundle.writtenWorks.find((w) => w.id === activeWorkId) || null;
  const students = sortStudents(bundle.students);

  const createWork = async () => {
    if (!newTitle.trim() || !newDate) return;
    const quarter = quarterForDate(quarters, newDate);
    if (!quarter) return;
    const created = await api.createWrittenWork(bundle.course.id, {
      quarterId: quarter.id,
      kind: newKind,
      title: newTitle.trim(),
      content: newContent.trim(),
      date: newDate,
      weight: 1,
    });
    setAddOpen(false);
    setNewTitle('');
    setNewContent('');
    await onRefresh();
    setActiveWorkId(created.id);
  };

  const openEdit = (w, el) => {
    editAnchorRef.current = el;
    setEditWorkId(w.id);
    setEditKind(w.kind);
    setEditTitle(w.title);
    setEditContent(w.content);
    setEditDate(w.date);
    setEditWeight(String(w.weight));
  };

  const saveEdit = async () => {
    await api.updateWrittenWork(editWorkId, {
      kind: editKind,
      title: editTitle.trim(),
      content: editContent.trim(),
      date: editDate,
      weight: parseFloat(editWeight.replace(',', '.')) || 1,
    });
    setEditWorkId(null);
    onRefresh();
  };

  const deleteWork = async () => {
    await api.deleteWrittenWork(editWorkId);
    setEditWorkId(null);
    setActiveWorkId(null);
    onRefresh();
  };

  const gradeFor = (studentId) => work?.grades.find((g) => g.student_id === studentId)?.grade || null;
  const remarksFor = (studentId) => work?.remarks.filter((r) => r.student_id === studentId) || [];
  const setGrade = (studentId, grade) => api.setWrittenWorkGrade(activeWorkId, studentId, grade).then(onRefresh);

  // Whole-set lock (Notensatz) for this written work — same model as
  // Stundenerfassung's Mitarbeit grades. Individual grades aren't lockable.
  const setLocked = !!work?.grades_locked;
  const toggleSetLock = () => api.updateWrittenWork(activeWorkId, { gradesLocked: !setLocked }).then(onRefresh);

  const addPreset = (studentId) => (preset) =>
    api.createRemark({ targetType: 'written_work', targetId: activeWorkId, studentId, emoji: preset.emoji, text: preset.text }).then(onRefresh);
  const addCustom = (studentId) => ({ emoji, text }, remember) => {
    api.createRemark({ targetType: 'written_work', targetId: activeWorkId, studentId, emoji, text }).then(onRefresh);
    if (remember) api.createRemarkPreset({ emoji, text }).then(onRefreshPresets);
  };
  const updateRemark = (id, patch) => api.updateRemark(id, patch).then(onRefresh);
  const deleteRemark = (id) => api.deleteRemark(id).then(onRefresh);
  const deletePreset = (id) => api.deleteRemarkPreset(id).then(onRefreshPresets);

  const workAvg = (w) => {
    const pairs = students.map((s) => [num(w.grades.find((g) => g.student_id === s.id)?.grade), 1]);
    return wavg(pairs);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: isDesktop ? 'row' : 'column' }}>
      <section
        className="scroll-panel"
        style={{
          width: isDesktop ? 330 : '100%',
          flex: 'none',
          maxHeight: isDesktop ? 'none' : '38vh',
          borderRight: isDesktop ? `1px solid ${colors.border}` : 'none',
          borderBottom: isDesktop ? 'none' : `1px solid ${colors.border}`,
          padding: 18,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {WRITTEN_WORK_KINDS.map((k) => {
          const worksForKind = allWorks.filter((w) => w.kind === k.value);
          const isCollapsed = !!collapsedKinds[k.value];
          return (
            <div key={k.value} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => toggleKindCollapsed(k.value)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '4px 2px' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CollapseArrow collapsed={isCollapsed} openGlyph="▾" />
                  <span style={{ font: `600 10.5px ${fonts.mono}`, color: colors.mutedStrong, letterSpacing: '.06em' }}>{SECTION_LABELS[k.value].toUpperCase()}</span>
                </span>
                <span style={{ font: `500 10px ${fonts.mono}`, color: colors.faint }}>{worksForKind.length}</span>
              </button>
              {!isCollapsed &&
                (worksForKind.length ? (
                  worksForKind.map((w) => {
                    const on = w.id === activeWorkId;
                    const avg = workAvg(w);
                    return (
                      <div key={w.id} style={{ position: 'relative', flex: 'none' }}>
                        <button
                          onClick={() => setActiveWorkId(w.id)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 5,
                            padding: '13px 14px',
                            borderRadius: 9,
                            textAlign: 'left',
                            width: '100%',
                            border: `1px solid ${on ? colors.teal : colors.borderCard}`,
                            background: on ? '#fff' : colors.cream,
                            boxShadow: on ? '0 1px 4px rgba(0,0,0,.06)' : 'none',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingRight: 52 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{w.title}</span>
                            <span style={{ font: `500 11px ${fonts.mono}`, opacity: 0.65 }}>{w.date}</span>
                          </span>
                          {w.content && <span style={{ fontSize: 12, color: colors.mutedStrong, lineHeight: 1.45, textAlign: 'left' }}>{w.content}</span>}
                          <span style={{ fontSize: 11.5, color: colors.muted }}>Ø {fmt(avg)}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadWorkStatsImage(w, students); }}
                          title="Notenverteilung als Bild herunterladen"
                          style={{ ...cornerBtnStyle(false), right: 39 }}
                        >
                          <BarChartIcon />
                        </button>
                        <button
                          onClick={(e) => openEdit(w, e.currentTarget)}
                          style={{ ...cornerBtnStyle(editWorkId === w.id), right: 11 }}
                        >
                          ✎
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <span style={{ fontSize: 11.5, color: colors.faint, padding: '0 2px 4px' }}>Keine Einträge</span>
                ))}
            </div>
          );
        })}
        <button
          ref={addBtnRef}
          onClick={() => setAddOpen((v) => !v)}
          style={{ width: '100%', padding: 12, border: `1px dashed ${addOpen ? colors.teal : colors.borderStrong}`, borderRadius: 9, color: addOpen ? colors.teal : colors.mutedStrong, fontSize: 12.5 }}
        >
          + Neue Schriftliche Leistung
        </button>
      </section>

      <Popover open={editWorkId != null} anchorRef={editAnchorRef} onClose={() => setEditWorkId(null)} width={296}>
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
            <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>ARBEIT BEARBEITEN</span>
            <button onClick={() => setEditWorkId(null)} style={{ fontSize: 13, color: colors.muted }}>
              ✕
            </button>
          </div>
          <select value={editKind} onChange={(e) => setEditKind(e.target.value)} style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }}>
            {WRITTEN_WORK_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={submitOnEnter(saveEdit)} style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <textarea rows={3} value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={submitOnEnter(saveEdit)} style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, resize: 'vertical' }} />
          <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} onKeyDown={submitOnEnter(saveEdit)} style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <input value={editWeight} onChange={(e) => setEditWeight(e.target.value)} onKeyDown={submitOnEnter(saveEdit)} placeholder="Gewicht" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveEdit} style={{ flex: 1, padding: 9, borderRadius: 8, background: colors.teal, color: '#fff', fontSize: 12.5, fontWeight: 500 }}>
              Speichern
            </button>
            <button onClick={deleteWork} style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${colors.redBorder}`, color: colors.red, fontSize: 12.5 }}>
              Löschen
            </button>
          </div>
        </div>
      </Popover>

      <Popover open={addOpen} anchorRef={addBtnRef} onClose={() => setAddOpen(false)} width={296}>
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
            <span style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' }}>NEUE SCHRIFTLICHE LEISTUNG</span>
            <button onClick={() => setAddOpen(false)} style={{ fontSize: 13, color: colors.muted }}>
              ✕
            </button>
          </div>
          <select value={newKind} onChange={(e) => setNewKind(e.target.value)} style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }}>
            {WRITTEN_WORK_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={submitOnEnter(createWork)} placeholder="z. B. 2. Klassenarbeit" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <textarea rows={3} value={newContent} onChange={(e) => setNewContent(e.target.value)} onKeyDown={submitOnEnter(createWork)} placeholder="Themen, Aufgabentypen …" style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, resize: 'vertical' }} />
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} onKeyDown={submitOnEnter(createWork)} style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <button onClick={createWork} style={{ padding: 9, borderRadius: 8, background: colors.teal, color: '#fff', fontSize: 12.5, fontWeight: 500 }}>
            Anlegen
          </button>
        </div>
      </Popover>

      <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!work ? (
          <div style={{ padding: 40, color: colors.mutedStrong, fontSize: 13 }}>
            Noch keine schriftliche Leistung — links über „+“ anlegen.
          </div>
        ) : (
          <>
            {/* Just name + description here (the kind/category and the date
                are shown on the sidebar entry already), with the Sperre --
                lock icon first, then GESPERRT -- directly beside them. */}
            <div style={{ padding: '16px 24px 13px', borderBottom: `1px solid ${colors.border}`, display: 'flex', flexWrap: 'wrap', gap: 14, rowGap: 6, alignItems: 'baseline' }}>
              <span style={{ font: `500 16px/1.2 ${fonts.serif}` }}>{work.title}</span>
              {work.content && <span style={{ fontSize: 12, color: colors.mutedStrong, flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{work.content}</span>}
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span ref={setLockRef} style={{ display: 'inline-flex' }}>
                  <LockButton locked={setLocked} onClick={toggleSetLock} size={22} title={setLocked ? 'Notensatz entsperren' : 'Ganzen Notensatz sperren'} />
                </span>
                {setLocked && <span style={{ font: `600 9.5px ${fonts.mono}`, color: colors.gold, letterSpacing: '.06em' }}>GESPERRT</span>}
              </span>
            </div>
            {/* One shared scroll container (not a separate header) so the
                "#"/name columns can stay pinned via position:sticky while
                the grade/remark columns scroll sideways on a narrow screen
                — sticky's `left` accounts for the row's own 24px padding,
                same reasoning as Stundenerfassung's roster. */}
            <div className="scroll-panel" style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
              {students.map((s, i) => {
                // The row a grade was clicked for, coming from the
                // Notenübersicht — see highlightedStudentId's own comment.
                const highlighted = s.id === highlightedStudentId;
                const rowBg = highlighted ? colors.highlightBg : undefined;
                return (
                  <div
                    key={s.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '26px 200px 356px 1fr',
                      alignItems: 'center',
                      gap: 14,
                      padding: '7px 24px',
                      borderBottom: `1px solid ${colors.divider}`,
                      borderLeft: `4px solid ${highlighted ? colors.highlight : 'transparent'}`,
                      background: rowBg,
                      minWidth: 'max-content',
                    }}
                  >
                    <span style={{ position: 'sticky', left: 24, background: rowBg ?? colors.panelBg, font: `500 11px ${fonts.mono}`, color: colors.faint }}>{String(i + 1).padStart(2, '0')}</span>
                    <button onClick={() => onOpenStudent(s.id, 'ka')} style={{ position: 'sticky', left: 64, background: rowBg ?? colors.panelBg, display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, fontSize: 13.5, fontWeight: 500, textAlign: 'left' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{studentDisplayName(s)}</span>
                      {studentKlasseLabel(s) && <span style={{ flex: 'none', fontSize: 10, fontWeight: 500, color: colors.muted }}>{studentKlasseLabel(s)}</span>}
                    </button>
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
            </div>
          </>
        )}
      </section>
    </div>
  );
}
