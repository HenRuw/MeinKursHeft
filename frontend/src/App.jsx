import { useCallback, useEffect, useRef, useState } from 'react';
import { api, subscribeSync } from './api.js';
import { colors, fonts } from './theme.js';
import Popover from './components/Popover.jsx';
import StudentPicker from './components/StudentPicker.jsx';
import Stundenerfassung from './screens/Stundenerfassung.jsx';
import SchriftlicheLeistungen from './screens/SchriftlicheLeistungen.jsx';
import Notenuebersicht from './screens/Notenuebersicht.jsx';
import Schueleransicht from './screens/Schueleransicht.jsx';
import Schuelerverwaltung from './screens/Schuelerverwaltung.jsx';
import Einstellungen from './screens/Einstellungen.jsx';

const menuPanel = {
  background: '#fff',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 12,
  boxShadow: '0 12px 32px rgba(0,0,0,.18)',
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const menuHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const menuLabel = { font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' };
const menuOptionBtn = { textAlign: 'left', padding: '9px 10px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, fontSize: 12.5 };
const menuInput = { padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 };
const menuPrimaryBtn = { flex: 1, padding: '8px 0', borderRadius: 7, background: colors.teal, color: '#fff', fontSize: 12.5, fontWeight: 500 };
const menuSecondaryBtn = { padding: '8px 12px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, fontSize: 12.5 };

const TABS = [
  ['stunde', 'Stundenerfassung'],
  ['ka', 'Schriftliche Leistungen'],
  ['matrix', 'Notenübersicht'],
];

export default function App() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(null);
  const [screen, setScreen] = useState('stunde');
  const [bundle, setBundle] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [fromScreen, setFromScreen] = useState('stunde');
  const [allStudents, setAllStudents] = useState([]);
  const [presets, setPresets] = useState([]);
  const [newCourseOpen, setNewCourseOpen] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseStudentIds, setNewCourseStudentIds] = useState(new Set());
  const [newCourseStudentsOpen, setNewCourseStudentsOpen] = useState(false);
  const newCourseStudentsBtnRef = useRef(null);

  const editAnchorRef = useRef(null);
  const [editMenuCourseId, setEditMenuCourseId] = useState(null);
  const [editMenuMode, setEditMenuMode] = useState('menu'); // 'menu' | 'rename' | 'students'
  const [renameValue, setRenameValue] = useState('');
  const [editCourseStudentIds, setEditCourseStudentIds] = useState(new Set());
  const [editCourseOriginalIds, setEditCourseOriginalIds] = useState(new Set());

  const refreshCourses = useCallback(async () => {
    const list = await api.listCourses();
    setCourses(list);
    return list;
  }, []);

  const refreshAllStudents = useCallback(async () => {
    setAllStudents(await api.listStudents());
  }, []);

  const refreshPresets = useCallback(async () => {
    setPresets(await api.listRemarkPresets());
  }, []);

  const refreshBundle = useCallback(async (id) => {
    if (!id) {
      setBundle(null);
      return;
    }
    setBundle(await api.getCourseBundle(id));
  }, []);

  useEffect(() => {
    refreshCourses().then((list) => {
      if (list.length && courseId == null) setCourseId(list[0].id);
    });
    refreshAllStudents();
    refreshPresets();
  }, []);

  useEffect(() => {
    refreshBundle(courseId);
  }, [courseId, refreshBundle]);

  useEffect(
    () =>
      subscribeSync(({ resource, courseId: changedCourseId }) => {
        if (resource === 'courses') {
          refreshCourses();
          if (courseId && (changedCourseId == null || changedCourseId === courseId)) refreshBundle(courseId);
        } else if (resource === 'students') {
          refreshAllStudents();
          if (courseId) refreshBundle(courseId);
        } else if (resource === 'remark-presets') {
          refreshPresets();
        }
      }),
    [courseId, refreshCourses, refreshAllStudents, refreshBundle, refreshPresets]
  );

  const TAB_SCREENS = ['stunde', 'ka', 'matrix'];
  const selectCourse = (id) => {
    setCourseId(id);
    if (screen === 'student') setScreen(fromScreen);
    else if (!TAB_SCREENS.includes(screen)) setScreen('stunde');
  };

  const openStudent = (id, from) => {
    setStudentId(id);
    setFromScreen(from);
    setScreen('student');
  };

  const createCourse = async () => {
    if (!newCourseName.trim()) return;
    const course = await api.createCourse({ name: newCourseName.trim() });
    for (const id of newCourseStudentIds) {
      await api.enrollStudent(course.id, id);
    }
    await refreshCourses();
    setCourseId(course.id);
    setScreen('stunde');
    setNewCourseOpen(false);
    setNewCourseName('');
    setNewCourseStudentIds(new Set());
    setNewCourseStudentsOpen(false);
  };

  const toggleNewCourseStudent = (id) =>
    setNewCourseStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openCourseMenu = (course, el) => {
    editAnchorRef.current = el;
    setEditMenuCourseId(course.id);
    setEditMenuMode('menu');
    setRenameValue(course.name);
  };

  const closeCourseMenu = () => {
    setEditMenuCourseId(null);
    setEditMenuMode('menu');
  };

  const saveRename = async () => {
    if (!renameValue.trim()) return;
    await api.updateCourse(editMenuCourseId, { name: renameValue.trim() });
    await refreshCourses();
    if (editMenuCourseId === courseId) await refreshBundle(courseId);
    closeCourseMenu();
  };

  const openStudentsEdit = async () => {
    const targetId = editMenuCourseId;
    const target = await api.getCourseBundle(targetId);
    const ids = new Set((target?.students || []).map((s) => s.id));
    setEditCourseOriginalIds(ids);
    setEditCourseStudentIds(new Set(ids));
    setEditMenuMode('students');
  };

  const toggleEditCourseStudent = (id) =>
    setEditCourseStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const saveCourseStudents = async () => {
    const targetId = editMenuCourseId;
    const added = [...editCourseStudentIds].filter((id) => !editCourseOriginalIds.has(id));
    const removed = [...editCourseOriginalIds].filter((id) => !editCourseStudentIds.has(id));
    for (const id of added) await api.enrollStudent(targetId, id);
    for (const id of removed) await api.unenrollStudent(targetId, id);
    if (targetId === courseId) await refreshBundle(courseId);
    closeCourseMenu();
  };

  const onRefreshBundle = () => refreshBundle(courseId);

  return (
    <div style={{ display: 'flex', height: '100%', background: colors.panelBg, fontFamily: fonts.sans, color: colors.ink }}>
      <aside
        style={{
          width: 232,
          flex: 'none',
          background: colors.sidebarBg,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(255,255,255,.09)' }}>
          <div style={{ font: `500 19px/1 ${fonts.serif}`, color: '#fff', letterSpacing: '.01em' }}>Notenbuch</div>
          <div style={{ font: `400 11px ${fonts.mono}`, color: '#7f918c', marginTop: 6, letterSpacing: '.06em' }}>
            SCHULJAHR 2026/27
          </div>
        </div>
        <div style={{ padding: '16px 12px 8px', flex: 1, overflow: 'auto' }}>
          <div style={{ font: `500 10px ${fonts.mono}`, color: '#6f817c', letterSpacing: '.1em', padding: '0 6px 8px' }}>
            KURSE
          </div>
          {courses.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                borderRadius: 7,
                background: c.id === courseId ? 'rgba(255,255,255,.10)' : 'transparent',
              }}
            >
              <button
                onClick={(e) => openCourseMenu(c, e.currentTarget)}
                title="Kurs bearbeiten"
                style={{
                  flex: 'none',
                  width: 24,
                  height: 24,
                  marginLeft: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  fontSize: 12,
                  color: c.id === courseId ? '#fff' : '#7f918c',
                }}
              >
                ✎
              </button>
              <button
                onClick={() => selectCourse(c.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  flex: 1,
                  minWidth: 0,
                  padding: '9px 10px 9px 4px',
                  borderRadius: 7,
                  color: c.id === courseId ? '#fff' : '#9fb0ab',
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left', minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>{c.hours_per_week} Std/Woche</span>
                </span>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    background: c.id === courseId ? '#3fbf9a' : 'transparent',
                    flex: 'none',
                  }}
                />
              </button>
            </div>
          ))}

          {newCourseOpen ? (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 9,
                background: 'rgba(255,255,255,.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <input
                autoFocus
                placeholder="Kursname"
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                style={{ padding: '7px 8px', borderRadius: 6, border: '1px solid #3a4744', background: '#0f1614', color: '#fff', fontSize: 12.5 }}
              />
              <button
                ref={newCourseStudentsBtnRef}
                onClick={() => setNewCourseStudentsOpen((v) => !v)}
                style={{ padding: '7px 8px', borderRadius: 6, border: '1px solid #3a4744', background: '#0f1614', color: '#cfe0da', fontSize: 12, textAlign: 'left' }}
              >
                Schüler auswählen{newCourseStudentIds.size > 0 ? ` (${newCourseStudentIds.size})` : ''}
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={createCourse}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, background: colors.teal, color: '#fff', fontSize: 12, fontWeight: 500 }}
                >
                  Anlegen
                </button>
                <button
                  onClick={() => {
                    setNewCourseOpen(false);
                    setNewCourseStudentsOpen(false);
                  }}
                  style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #3a4744', color: '#9fb0ab', fontSize: 12 }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setNewCourseOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '9px 10px',
                marginTop: 6,
                borderRadius: 7,
                color: '#9fb0ab',
                fontSize: 12.5,
                border: '1px dashed rgba(255,255,255,.16)',
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>Kurs anlegen
            </button>
          )}
        </div>
        <div
          style={{
            padding: '14px 12px 16px',
            borderTop: '1px solid rgba(255,255,255,.09)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <button
            onClick={() => setScreen('schuelerverwaltung')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '8px 10px',
              borderRadius: 7,
              color: screen === 'schuelerverwaltung' ? '#fff' : '#9fb0ab',
              background: screen === 'schuelerverwaltung' ? 'rgba(255,255,255,.06)' : 'transparent',
              fontSize: 12.5,
            }}
          >
            Schülerverwaltung
          </button>
          <button
            onClick={() => setScreen('einstellungen')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '8px 10px',
              borderRadius: 7,
              color: screen === 'einstellungen' ? '#fff' : '#9fb0ab',
              background: screen === 'einstellungen' ? 'rgba(255,255,255,.06)' : 'transparent',
              fontSize: 12.5,
            }}
          >
            Gewichtung &amp; Einstellungen
          </button>
        </div>
      </aside>

      <Popover open={newCourseStudentsOpen} anchorRef={newCourseStudentsBtnRef} onClose={() => setNewCourseStudentsOpen(false)} align="left" width={260}>
        <div style={menuPanel}>
          <div style={menuHeader}>
            <span style={menuLabel}>SCHÜLER AUSWÄHLEN</span>
            <button onClick={() => setNewCourseStudentsOpen(false)} style={{ fontSize: 13, color: colors.muted }}>
              ✕
            </button>
          </div>
          <StudentPicker students={allStudents} selectedIds={newCourseStudentIds} onToggle={toggleNewCourseStudent} />
          <button onClick={() => setNewCourseStudentsOpen(false)} style={menuPrimaryBtn}>
            Fertig
          </button>
        </div>
      </Popover>

      <Popover open={editMenuCourseId != null} anchorRef={editAnchorRef} onClose={closeCourseMenu} align="left" width={editMenuMode === 'students' ? 280 : 240}>
        <div style={menuPanel}>
          {editMenuMode === 'menu' && (
            <>
              <div style={menuHeader}>
                <span style={menuLabel}>KURS BEARBEITEN</span>
                <button onClick={closeCourseMenu} style={{ fontSize: 13, color: colors.muted }}>
                  ✕
                </button>
              </div>
              <button onClick={() => setEditMenuMode('rename')} style={menuOptionBtn}>
                Titel ändern
              </button>
              <button onClick={openStudentsEdit} style={menuOptionBtn}>
                Schüler bearbeiten
              </button>
            </>
          )}
          {editMenuMode === 'rename' && (
            <>
              <div style={menuHeader}>
                <span style={menuLabel}>TITEL ÄNDERN</span>
                <button onClick={closeCourseMenu} style={{ fontSize: 13, color: colors.muted }}>
                  ✕
                </button>
              </div>
              <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} style={menuInput} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveRename} style={menuPrimaryBtn}>
                  Speichern
                </button>
                <button onClick={() => setEditMenuMode('menu')} style={menuSecondaryBtn}>
                  Zurück
                </button>
              </div>
            </>
          )}
          {editMenuMode === 'students' && (
            <>
              <div style={menuHeader}>
                <span style={menuLabel}>SCHÜLER BEARBEITEN</span>
                <button onClick={closeCourseMenu} style={{ fontSize: 13, color: colors.muted }}>
                  ✕
                </button>
              </div>
              <StudentPicker students={allStudents} selectedIds={editCourseStudentIds} onToggle={toggleEditCourseStudent} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveCourseStudents} style={menuPrimaryBtn}>
                  Speichern
                </button>
                <button onClick={() => setEditMenuMode('menu')} style={menuSecondaryBtn}>
                  Zurück
                </button>
              </div>
            </>
          )}
        </div>
      </Popover>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {screen !== 'schuelerverwaltung' && (
          <header style={{ padding: '18px 24px 0', background: colors.panelBg, borderBottom: '1px solid ' + colors.border }}>
            <div style={{ font: `500 24px/1.1 ${fonts.serif}` }}>
              {bundle ? bundle.course.name : courses.length ? '…' : 'Noch kein Kurs angelegt'}
            </div>
            {screen !== 'einstellungen' && (
              <nav style={{ display: 'flex', gap: 2, marginTop: 16 }}>
                {TABS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setScreen(key)}
                    style={{
                      padding: '10px 15px',
                      fontSize: 13,
                      fontWeight: screen === key ? 600 : 500,
                      color: screen === key ? colors.teal : colors.mutedStrong,
                      borderBottom: screen === key ? `2px solid ${colors.teal}` : '2px solid transparent',
                      marginBottom: -1,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            )}
          </header>
        )}

        {!bundle && screen !== 'schuelerverwaltung' ? (
          <div style={{ padding: 40, color: colors.mutedStrong, fontSize: 13 }}>
            {courses.length ? 'Kurs wird geladen …' : 'Lege links einen Kurs an, um loszulegen.'}
          </div>
        ) : (
          <>
            {screen === 'stunde' && (
              <Stundenerfassung bundle={bundle} onRefresh={onRefreshBundle} onOpenStudent={openStudent} presets={presets} onRefreshPresets={refreshPresets} />
            )}
            {screen === 'ka' && (
              <SchriftlicheLeistungen bundle={bundle} onRefresh={onRefreshBundle} onOpenStudent={openStudent} presets={presets} onRefreshPresets={refreshPresets} />
            )}
            {screen === 'matrix' && <Notenuebersicht bundle={bundle} onRefresh={onRefreshBundle} onOpenStudent={openStudent} />}
            {screen === 'student' && (
              <Schueleransicht bundle={bundle} studentId={studentId} onBack={() => setScreen(fromScreen)} />
            )}
            {screen === 'einstellungen' && <Einstellungen bundle={bundle} onRefresh={onRefreshBundle} />}
          </>
        )}
        {screen === 'schuelerverwaltung' && (
          <Schuelerverwaltung
            allStudents={allStudents}
            onRefreshAllStudents={refreshAllStudents}
            bundle={bundle}
            onRefreshBundle={onRefreshBundle}
          />
        )}
      </main>
    </div>
  );
}
