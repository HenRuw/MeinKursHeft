import { useCallback, useEffect, useRef, useState } from 'react';
import { api, subscribeSync } from './api.js';
import { colors, fonts } from './theme.js';
import Popover from './components/Popover.jsx';
import Stundenerfassung from './screens/Stundenerfassung.jsx';
import SchriftlicheLeistungen from './screens/SchriftlicheLeistungen.jsx';
import Notenuebersicht from './screens/Notenuebersicht.jsx';
import Schueleransicht from './screens/Schueleransicht.jsx';
import Schuelerverwaltung from './screens/Schuelerverwaltung.jsx';
import Quartalsdaten from './screens/Quartalsdaten.jsx';
import KursEditor from './screens/KursEditor.jsx';

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
const menuOptionBtn = { textAlign: 'left', padding: '9px 10px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, fontSize: 12.5 };

const TABS = [
  ['stunde', 'Stundenerfassung'],
  ['ka', 'Schriftliche Leistungen'],
  ['matrix', 'Notenübersicht'],
];

const VERWALTUNG_SCREENS = ['schuelerverwaltung', 'quartalsdaten'];
const NO_HEADER_SCREENS = [...VERWALTUNG_SCREENS, 'kurs-editor'];

export default function App() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(null);
  const [screen, setScreen] = useState('stunde');
  const [bundle, setBundle] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [fromScreen, setFromScreen] = useState('stunde');
  const [allStudents, setAllStudents] = useState([]);
  const [klassen, setKlassen] = useState([]);
  const [presets, setPresets] = useState([]);

  const [courseEditorMode, setCourseEditorMode] = useState('create'); // 'create' | 'edit'
  const [courseEditorCourse, setCourseEditorCourse] = useState(null); // the course being edited, or null when creating
  const [courseEditorEnrolledIds, setCourseEditorEnrolledIds] = useState(new Set());
  const [preEditorScreen, setPreEditorScreen] = useState('stunde');

  const verwaltungBtnRef = useRef(null);
  const [verwaltungMenuOpen, setVerwaltungMenuOpen] = useState(false);

  const refreshCourses = useCallback(async () => {
    const list = await api.listCourses();
    setCourses(list);
    return list;
  }, []);

  const refreshAllStudents = useCallback(async () => {
    setAllStudents(await api.listStudents());
  }, []);

  const refreshKlassen = useCallback(async () => {
    setKlassen(await api.listKlassen());
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
    refreshKlassen();
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
        } else if (resource === 'klassen') {
          refreshKlassen();
        } else if (resource === 'remark-presets') {
          refreshPresets();
        }
      }),
    [courseId, refreshCourses, refreshAllStudents, refreshKlassen, refreshBundle, refreshPresets]
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

  const openCourseCreator = () => {
    setCourseEditorMode('create');
    setCourseEditorCourse(null);
    setCourseEditorEnrolledIds(new Set());
    setPreEditorScreen(screen);
    setScreen('kurs-editor');
  };

  const openCourseEditor = async (course) => {
    const target = await api.getCourseBundle(course.id);
    setCourseEditorMode('edit');
    setCourseEditorCourse(course);
    setCourseEditorEnrolledIds(new Set((target?.students || []).map((s) => s.id)));
    setPreEditorScreen(screen);
    setScreen('kurs-editor');
  };

  const closeCourseEditor = () => setScreen(preEditorScreen);

  const submitCourseEditor = async ({ name, hoursPerWeek, studentIds }) => {
    if (courseEditorMode === 'create') {
      const course = await api.createCourse({ name });
      for (const id of studentIds) await api.enrollStudent(course.id, id);
      await refreshCourses();
      setCourseId(course.id);
      setScreen('stunde');
    } else {
      const targetId = courseEditorCourse.id;
      await api.updateCourse(targetId, { name, hoursPerWeek });
      const added = [...studentIds].filter((id) => !courseEditorEnrolledIds.has(id));
      const removed = [...courseEditorEnrolledIds].filter((id) => !studentIds.has(id));
      for (const id of added) await api.enrollStudent(targetId, id);
      for (const id of removed) await api.unenrollStudent(targetId, id);
      await refreshCourses();
      if (targetId === courseId) await refreshBundle(courseId);
      setScreen(preEditorScreen);
    }
  };

  const deleteCourseFromEditor = async () => {
    const targetId = courseEditorCourse.id;
    await api.deleteCourse(targetId);
    const list = await refreshCourses();
    if (targetId === courseId) setCourseId(list.length ? list[0].id : null);
    setScreen('stunde');
  };

  const onRefreshBundle = () => refreshBundle(courseId);

  const openVerwaltungScreen = (key) => {
    setScreen(key);
    setVerwaltungMenuOpen(false);
  };

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
                onClick={() => selectCourse(c.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  flex: 1,
                  minWidth: 0,
                  padding: '9px 4px 9px 10px',
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
              <button
                onClick={() => openCourseEditor(c)}
                title="Kurs bearbeiten"
                style={{
                  flex: 'none',
                  width: 24,
                  height: 24,
                  marginRight: 4,
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
            </div>
          ))}

          <button
            onClick={openCourseCreator}
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
            ref={verwaltungBtnRef}
            onClick={() => setVerwaltungMenuOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '8px 10px',
              borderRadius: 7,
              color: VERWALTUNG_SCREENS.includes(screen) ? '#fff' : '#9fb0ab',
              background: VERWALTUNG_SCREENS.includes(screen) ? 'rgba(255,255,255,.06)' : 'transparent',
              fontSize: 12.5,
            }}
          >
            Verwaltung
          </button>
        </div>
      </aside>

      <Popover open={verwaltungMenuOpen} anchorRef={verwaltungBtnRef} onClose={() => setVerwaltungMenuOpen(false)} align="left" width={200}>
        <div style={menuPanel}>
          <button onClick={() => openVerwaltungScreen('schuelerverwaltung')} style={menuOptionBtn}>
            Schülerdaten
          </button>
          <button onClick={() => openVerwaltungScreen('quartalsdaten')} style={menuOptionBtn}>
            Quartalsdaten
          </button>
        </div>
      </Popover>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!NO_HEADER_SCREENS.includes(screen) && (
          <header style={{ padding: '18px 24px 0', background: colors.panelBg, borderBottom: '1px solid ' + colors.border }}>
            <div style={{ font: `500 24px/1.1 ${fonts.serif}` }}>
              {bundle ? bundle.course.name : courses.length ? '…' : 'Noch kein Kurs angelegt'}
            </div>
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
          </header>
        )}

        {!bundle && !NO_HEADER_SCREENS.includes(screen) ? (
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
          </>
        )}
        {screen === 'schuelerverwaltung' && (
          <Schuelerverwaltung allStudents={allStudents} onRefreshAllStudents={refreshAllStudents} klassen={klassen} onRefreshKlassen={refreshKlassen} />
        )}
        {screen === 'quartalsdaten' && <Quartalsdaten courses={courses} />}
        {screen === 'kurs-editor' && (
          <KursEditor
            mode={courseEditorMode}
            course={courseEditorCourse}
            allStudents={allStudents}
            klassen={klassen}
            initialSelectedIds={courseEditorEnrolledIds}
            onSubmit={submitCourseEditor}
            onDelete={deleteCourseFromEditor}
            onCancel={closeCourseEditor}
          />
        )}
      </main>
    </div>
  );
}
