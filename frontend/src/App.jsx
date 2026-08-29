import { useCallback, useEffect, useState } from 'react';
import { api, subscribeSync } from './api.js';
import { colors, fonts } from './theme.js';
import Stundenerfassung from './screens/Stundenerfassung.jsx';
import SchriftlicheLeistungen from './screens/SchriftlicheLeistungen.jsx';
import Notenuebersicht from './screens/Notenuebersicht.jsx';
import Schueleransicht from './screens/Schueleransicht.jsx';
import Schuelerverwaltung from './screens/Schuelerverwaltung.jsx';
import Einstellungen from './screens/Einstellungen.jsx';

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
  const [newCourseHours, setNewCourseHours] = useState('4');

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
    const hours = parseFloat(newCourseHours.replace(',', '.')) || 1;
    const course = await api.createCourse({ name: newCourseName.trim(), hoursPerWeek: hours });
    await refreshCourses();
    setCourseId(course.id);
    setScreen('stunde');
    setNewCourseOpen(false);
    setNewCourseName('');
    setNewCourseHours('4');
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
            <button
              key={c.id}
              onClick={() => selectCourse(c.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                width: '100%',
                padding: '9px 10px',
                borderRadius: 7,
                color: c.id === courseId ? '#fff' : '#9fb0ab',
                background: c.id === courseId ? 'rgba(255,255,255,.10)' : 'transparent',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
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
              <input
                placeholder="Std/Woche"
                value={newCourseHours}
                onChange={(e) => setNewCourseHours(e.target.value)}
                style={{ padding: '7px 8px', borderRadius: 6, border: '1px solid #3a4744', background: '#0f1614', color: '#fff', fontSize: 12.5 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={createCourse}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, background: colors.teal, color: '#fff', fontSize: 12, fontWeight: 500 }}
                >
                  Anlegen
                </button>
                <button
                  onClick={() => setNewCourseOpen(false)}
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
