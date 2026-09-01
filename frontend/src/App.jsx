import { useCallback, useEffect, useRef, useState } from 'react';
import { api, subscribeSync } from './api.js';
import { colors, fonts } from './theme.js';
import { useViewport } from './lib/useViewport.js';
import Stundenerfassung from './screens/Stundenerfassung.jsx';
import SchriftlicheLeistungen from './screens/SchriftlicheLeistungen.jsx';
import Notenuebersicht from './screens/Notenuebersicht.jsx';
import Schueleransicht from './screens/Schueleransicht.jsx';
import Schuelerverwaltung from './screens/Schuelerverwaltung.jsx';
import Quartalsdaten from './screens/Quartalsdaten.jsx';
import KursEditor from './screens/KursEditor.jsx';
import Export from './screens/Export.jsx';
import Backup from './screens/Backup.jsx';
import Schuljahre from './screens/Schuljahre.jsx';

// The Verwaltung submenu options, expanded inline inside the sidebar.
const VERWALTUNG_OPTIONS = [
  ['schuelerverwaltung', 'Schülerdaten'],
  ['schuljahre', 'Schuljahre'],
  ['quartalsdaten', 'Quartalsdaten'],
  ['export', 'Export'],
  ['backup', 'Backup'],
];

const TABS = [
  ['stunde', 'Mitarbeit'],
  ['ka', 'Schriftliche Leistungen'],
  ['matrix', 'Notenübersicht'],
];

const VERWALTUNG_SCREENS = VERWALTUNG_OPTIONS.map(([key]) => key);
const NO_HEADER_SCREENS = [...VERWALTUNG_SCREENS, 'kurs-editor'];

export default function App({ onLogout }) {
  const { isDesktop } = useViewport();
  // The sidebar collapses/expands on every viewport via the hamburger. It
  // starts open on a desktop (in-flow) and closed on phones/tablets (drawer).
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 1023 : true));
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(null);
  const [screen, setScreen] = useState('stunde');
  const [bundle, setBundle] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [fromScreen, setFromScreen] = useState('stunde');
  // When you leave a student's Schueleransicht via its "Zurück" button, the
  // Notenübersicht it sends you back to highlights that student's row so it's
  // easy to find again. Cleared as soon as you leave the Notenübersicht.
  const [matrixHighlightStudentId, setMatrixHighlightStudentId] = useState(null);
  const [allStudents, setAllStudents] = useState([]);
  const [klassen, setKlassen] = useState([]);
  const [presets, setPresets] = useState([]);
  // Global school-year context: the list of years and the one currently in
  // view. Everything below (courses, students, classes) is scoped to it.
  const [years, setYears] = useState([]);
  const [currentYearId, setCurrentYearId] = useState(null);
  const currentYear = years.find((y) => y.id === currentYearId) || null;
  const isArchived = !!(currentYear && currentYear.archived);

  // Clicking an individual grade — in the course-wide Notenübersicht, or in a
  // single student's own grade table on their Schueleransicht page — jumps
  // straight to the lesson/written-work it belongs to so it can be edited
  // there. Bundling the id with an incrementing token (rather than passing
  // the id alone) means clicking the *same* entry twice in a row still
  // re-triggers the focus effect on the target screen — a plain id wouldn't
  // change and the effect wouldn't rerun. returnScreen tracks that this was
  // a drill-down (not an ordinary tab switch) and which screen it started
  // from, which is when and where the "Zurück" button should send you.
  const [focusLesson, setFocusLesson] = useState(null);
  const [focusWork, setFocusWork] = useState(null);
  const [returnScreen, setReturnScreen] = useState(null); // 'matrix' | 'student' | null
  const focusTokenRef = useRef(0);

  const [courseEditorMode, setCourseEditorMode] = useState('create'); // 'create' | 'edit'
  const [courseEditorCourse, setCourseEditorCourse] = useState(null); // the course being edited, or null when creating
  const [courseEditorEnrolledIds, setCourseEditorEnrolledIds] = useState(new Set());
  const [preEditorScreen, setPreEditorScreen] = useState('stunde');
  // Bumped on every openCourseCreator/openCourseEditor and used as the
  // KursEditor's React key, so opening the editor for a *different* course (or
  // re-opening "Kurs anlegen") while already inside it remounts the editor
  // with a fresh form instead of leaving the previous course's name/roster in
  // its internal state. See openCourseCreator/openCourseEditor below.
  const [courseEditorNonce, setCourseEditorNonce] = useState(0);

  const [verwaltungMenuOpen, setVerwaltungMenuOpen] = useState(false);
  // Set to tell the Schuljahre screen to open its "Neues Schuljahr" wizard on
  // arrival — used by the year dropdown's "Neues Jahr anlegen" entry. The
  // screen flips it back off once it has opened, so remounting won't reopen it.
  const [yearWizardSignal, setYearWizardSignal] = useState(false);

  const refreshCourses = useCallback(async () => {
    if (currentYearId == null) return [];
    const list = await api.listCourses(currentYearId);
    setCourses(list);
    return list;
  }, [currentYearId]);

  const refreshAllStudents = useCallback(async () => {
    if (currentYearId == null) return;
    setAllStudents(await api.listStudents(currentYearId));
  }, [currentYearId]);

  const refreshKlassen = useCallback(async () => {
    if (currentYearId == null) return;
    setKlassen(await api.listClasses(currentYearId));
  }, [currentYearId]);

  const refreshYears = useCallback(async () => {
    const list = await api.listYears();
    setYears(list);
    return list;
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

  // Bootstrap: figure out which school year to open on, then year-independent
  // data (remark presets).
  useEffect(() => {
    (async () => {
      const ctx = await api.getYearContext();
      setYears(ctx.years);
      setCurrentYearId(ctx.currentYearId);
    })();
    refreshPresets();
  }, []);

  // Whenever the active year changes, reload everything scoped to it and jump
  // to that year's first course.
  useEffect(() => {
    if (currentYearId == null) return;
    setBundle(null);
    refreshCourses().then((list) => setCourseId(list.length ? list[0].id : null));
    refreshAllStudents();
    refreshKlassen();
  }, [currentYearId, refreshCourses, refreshAllStudents, refreshKlassen]);

  // Switching the year persists the choice server-side and updates the context.
  const selectYear = async (yearId) => {
    if (yearId === currentYearId) return;
    setCurrentYearId(yearId);
    api.setCurrentYear(yearId).catch(() => {});
    closeSidebarOnNavigate();
  };

  useEffect(() => {
    refreshBundle(courseId);
  }, [courseId, refreshBundle]);

  // Clears the drill-down state (which lesson/work to jump to, which
  // student's row to highlight there) the moment you leave that tab —
  // however you leave it: a tab click, "Zurück", switching courses, all go
  // through `screen` changing. Without this, returning to 'stunde'/'ka'
  // later (a plain tab click, not a fresh grade click from Notenübersicht)
  // would still find the old focusLesson/focusWork sitting there and
  // re-apply a jump/highlight that has nothing to do with how you actually
  // got there this time — the whole point is that it only ever reflects the
  // *most recent* arrival, for exactly as long as you stay on that tab.
  useEffect(() => {
    if (screen !== 'stunde') setFocusLesson(null);
  }, [screen]);
  useEffect(() => {
    if (screen !== 'ka') setFocusWork(null);
  }, [screen]);
  useEffect(() => {
    if (screen !== 'matrix') setMatrixHighlightStudentId(null);
  }, [screen]);

  useEffect(
    () =>
      subscribeSync(({ resource, courseId: changedCourseId }) => {
        if (resource === 'courses') {
          refreshCourses();
          if (courseId && (changedCourseId == null || changedCourseId === courseId)) refreshBundle(courseId);
        } else if (resource === 'students') {
          refreshAllStudents();
          if (courseId) refreshBundle(courseId);
        } else if (resource === 'klassen' || resource === 'classes') {
          refreshKlassen();
          refreshAllStudents();
        } else if (resource === 'years') {
          refreshYears();
        } else if (resource === 'remark-presets') {
          refreshPresets();
        } else if (resource === 'backup') {
          // A restore replaced the whole database -- refetch everything.
          refreshYears();
          refreshCourses();
          refreshAllStudents();
          refreshKlassen();
          refreshPresets();
          if (courseId) refreshBundle(courseId);
        }
      }),
    [courseId, refreshCourses, refreshAllStudents, refreshKlassen, refreshBundle, refreshPresets, refreshYears]
  );

  // On mobile/tablet the sidebar is an off-canvas drawer (see the aside's
  // own responsive styles below) — any navigation action taken inside it
  // should close it again, the same way a mobile nav drawer normally works.
  // On desktop it's an in-flow panel that stays put while you navigate.
  const closeSidebarOnNavigate = () => {
    if (!isDesktop) setSidebarOpen(false);
  };

  const TAB_SCREENS = ['stunde', 'ka', 'matrix'];
  const selectCourse = (id) => {
    setCourseId(id);
    setReturnScreen(null);
    if (screen === 'student') setScreen(fromScreen);
    else if (!TAB_SCREENS.includes(screen)) setScreen('stunde');
    closeSidebarOnNavigate();
  };

  const selectTab = (key) => {
    setScreen(key);
    setReturnScreen(null);
  };

  // `from` is 'matrix' when a grade was clicked in the course-wide
  // Notenübersicht, or 'student' when clicked in a student's own grade table
  // on their Schueleransicht page — the App-level `studentId` (which student
  // Schueleransicht itself is showing) doesn't need touching either way,
  // since it's already whatever it was set to get there. `highlightStudentId`
  // is a different thing: whichever student's grade was actually clicked, so
  // that row can be highlighted on the destination screen — matrix and
  // student both feed it the same way (Notenuebersicht passes the row's own
  // student id from either context).
  const openLessonForEditing = (lessonId, from, highlightStudentId) => {
    focusTokenRef.current += 1;
    setFocusLesson({ id: lessonId, token: focusTokenRef.current, highlightStudentId });
    setReturnScreen(from);
    setScreen('stunde');
  };

  const openWorkForEditing = (workId, from, highlightStudentId) => {
    focusTokenRef.current += 1;
    setFocusWork({ id: workId, token: focusTokenRef.current, highlightStudentId });
    setReturnScreen(from);
    setScreen('ka');
  };

  const backFromEditing = () => {
    setScreen(returnScreen);
    setReturnScreen(null);
  };

  const openStudent = (id, from) => {
    setStudentId(id);
    setFromScreen(from);
    setScreen('student');
  };

  // Remember the screen we came *from* only when we're not already in the
  // editor -- otherwise opening one course's editor from inside another's
  // would record 'kurs-editor' itself as the return target and "Abbrechen"/
  // "Speichern" would leave you stuck on the editor.
  const rememberPreEditorScreen = () => {
    if (screen !== 'kurs-editor') setPreEditorScreen(screen);
  };

  const openCourseCreator = () => {
    setCourseEditorMode('create');
    setCourseEditorCourse(null);
    setCourseEditorEnrolledIds(new Set());
    rememberPreEditorScreen();
    setCourseEditorNonce((n) => n + 1);
    setScreen('kurs-editor');
    closeSidebarOnNavigate();
  };

  const openCourseEditor = async (course) => {
    const target = await api.getCourseBundle(course.id);
    setCourseEditorMode('edit');
    setCourseEditorCourse(course);
    setCourseEditorEnrolledIds(new Set((target?.students || []).map((s) => s.id)));
    rememberPreEditorScreen();
    setCourseEditorNonce((n) => n + 1);
    setScreen('kurs-editor');
    closeSidebarOnNavigate();
  };

  const closeCourseEditor = () => setScreen(preEditorScreen);

  const submitCourseEditor = async ({ name, studentIds }) => {
    if (courseEditorMode === 'create') {
      const course = await api.createCourse({ name, yearId: currentYearId });
      for (const id of studentIds) await api.enrollStudent(course.id, id);
      await refreshCourses();
      setCourseId(course.id);
      setScreen('stunde');
    } else {
      const targetId = courseEditorCourse.id;
      await api.updateCourse(targetId, { name });
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
    closeSidebarOnNavigate();
  };

  // A course only counts as "selected" (highlighted in the sidebar) while one
  // of its own screens is showing. In a management menu or the course editor
  // no course is the active context, so none is highlighted.
  const activeCourseId = ['stunde', 'ka', 'matrix', 'student'].includes(screen) ? courseId : null;

  return (
    <div style={{ display: 'flex', height: '100%', background: colors.panelBg, fontFamily: fonts.sans, color: colors.ink, position: 'relative', overflow: 'hidden' }}>
      {!isDesktop && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 40 }}
        />
      )}
      <aside
        style={{
          flex: 'none',
          background: colors.sidebarBg,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ...(isDesktop
            ? {
                // In-flow on desktop: collapse its width to 0 instead of
                // sliding it off-screen, so the main area reclaims the space.
                width: sidebarOpen ? 232 : 0,
                transition: 'width 200ms ease',
              }
            : {
                width: 232,
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 50,
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 220ms ease',
              }),
        }}
      >
        <div style={{ padding: '13px 14px 16px 8px', borderBottom: '1px solid rgba(255,255,255,.09)' }}>
          {/* First line: hamburger toggle and the app title share one row. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Menü einklappen"
              style={{ width: 36, height: 36, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid rgba(255,255,255,.22)', color: '#9fb0ab', fontSize: 18 }}
            >
              ☰
            </button>
            <div style={{ font: `500 19px/1 ${fonts.serif}`, color: '#fff', letterSpacing: '.01em', minWidth: 0 }}>MeinKursHeft</div>
          </div>
          {/* Second line: the school-year switcher spans the full sidebar width.
              Everything in the app is scoped to the year picked here. An
              archived year is marked and shown in amber. */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
            <select
              value={currentYearId ?? ''}
              onChange={(e) => {
                // Sentinel bottom entry: jump to Schuljahre and open the wizard
                // instead of switching the active year.
                if (e.target.value === '__new__') {
                  setScreen('schuljahre');
                  setYearWizardSignal(true);
                  closeSidebarOnNavigate();
                  return;
                }
                selectYear(Number(e.target.value));
              }}
              aria-label="Schuljahr wählen"
              style={{
                flex: 1,
                minWidth: 0,
                background: 'rgba(255,255,255,.07)',
                color: isArchived ? '#e6b667' : '#cdd8d4',
                border: '1px solid rgba(255,255,255,.16)',
                borderRadius: 6,
                padding: '5px 6px',
                font: `500 12px ${fonts.mono}`,
                letterSpacing: '.04em',
              }}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id} style={{ color: '#000' }}>
                  {y.label}{y.archived ? ' · Archiv' : ''}
                </option>
              ))}
              <option value="__new__" style={{ color: '#000' }}>＋ Neues Jahr anlegen …</option>
            </select>
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
                background: c.id === activeCourseId ? 'rgba(255,255,255,.10)' : 'transparent',
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
                  color: c.id === activeCourseId ? '#fff' : '#9fb0ab',
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left', minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>
                </span>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    background: c.id === activeCourseId ? '#3fbf9a' : 'transparent',
                    flex: 'none',
                  }}
                />
              </button>
              {!isArchived && (
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
                  color: c.id === activeCourseId ? '#fff' : '#7f918c',
                }}
              >
                ✎
              </button>
              )}
            </div>
          ))}

          {!isArchived && (
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
          {/* The menu expands upward, above the Verwaltung button which stays
              pinned at the very bottom. Same dark nav style; a nested left rule
              signals the hierarchy. Abmelden is the last item in the menu. */}
          <div
            style={{
              overflow: 'hidden',
              maxHeight: verwaltungMenuOpen ? 260 : 0,
              opacity: verwaltungMenuOpen ? 1 : 0,
              transition: 'max-height 220ms ease, opacity 160ms ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                margin: '2px 0 4px 10px',
                paddingLeft: 8,
                borderLeft: '1px solid rgba(255,255,255,.10)',
              }}
            >
              {VERWALTUNG_OPTIONS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => openVerwaltungScreen(key)}
                  style={{
                    textAlign: 'left',
                    padding: '7px 10px',
                    borderRadius: 7,
                    fontSize: 12.5,
                    color: screen === key ? '#fff' : '#9fb0ab',
                    background: screen === key ? 'rgba(255,255,255,.10)' : 'transparent',
                  }}
                >
                  {label}
                </button>
              ))}
              {/* Logout as a point inside the menu, set off by a thin divider. */}
              <button
                onClick={onLogout}
                style={{
                  textAlign: 'left',
                  padding: '9px 10px 7px',
                  marginTop: 3,
                  borderTop: '1px solid rgba(255,255,255,.08)',
                  borderRadius: 7,
                  fontSize: 12.5,
                  color: '#9fb0ab',
                }}
              >
                Abmelden
              </button>
            </div>
          </div>

          <button
            onClick={() => setVerwaltungMenuOpen((v) => !v)}
            aria-expanded={verwaltungMenuOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 9,
              padding: '8px 10px',
              borderRadius: 7,
              color: verwaltungMenuOpen || VERWALTUNG_SCREENS.includes(screen) ? '#fff' : '#9fb0ab',
              background: VERWALTUNG_SCREENS.includes(screen) ? 'rgba(255,255,255,.06)' : 'transparent',
              fontSize: 12.5,
            }}
          >
            <span>Verwaltung</span>
            <span
              aria-hidden
              style={{
                fontSize: 9,
                color: '#7f918c',
                transition: 'transform 180ms ease',
                transform: verwaltungMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              ▴
            </span>
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isArchived && (
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#fbf1dc', borderBottom: '1px solid #ecd9ad', color: '#8a6417', fontSize: 12.5 }}>
            <span aria-hidden>🔒</span>
            <span><b>{currentYear.label}</b> ist archiviert — schreibgeschützt. Export bleibt möglich; zum Ändern das Schuljahr unter „Verwaltung › Schuljahre" reaktivieren.</span>
          </div>
        )}
        {/* The top strip only exists when it actually carries something: the
            hamburger opener (shown while the sidebar is collapsed) and/or the
            mobile course-name title. On desktop with the sidebar open it would
            be empty, so it's dropped entirely and the course heading moves up. */}
        {(!sidebarOpen || !isDesktop) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: colors.panelBg, borderBottom: `1px solid ${colors.border}`, flex: 'none' }}>
            {/* Opener shown only while the sidebar is collapsed -- a dark
                (not white) hamburger with a border. While the sidebar is open
                its own dark hamburger is the toggle, so there's only ever one
                hamburger and it always sits on a dark button. */}
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Menü öffnen"
                style={{ width: 40, height: 40, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid rgba(255,255,255,.22)', background: colors.sidebarBg, color: '#fff', fontSize: 16 }}
              >
                ☰
              </button>
            )}
            {/* On desktop the sidebar already shows the MeinKursHeft title, so the
                top bar carries none (no duplicate on the white strip). On
                mobile, where the sidebar is an off-canvas drawer, it shows the
                current course name (or the app title before a course loads). */}
            {!isDesktop && (
              <span style={{ font: `500 15px/1.1 ${fonts.serif}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {bundle ? bundle.course.name : 'MeinKursHeft'}
              </span>
            )}
          </div>
        )}
        {!NO_HEADER_SCREENS.includes(screen) && (
          <header style={{ padding: isDesktop ? '13px 24px 0' : '14px 16px 0', background: colors.panelBg, borderBottom: '1px solid ' + colors.border, flex: 'none' }}>
            {isDesktop && (
              <div style={{ font: `500 24px/1.1 ${fonts.serif}` }}>
                {bundle ? bundle.course.name : courses.length ? '…' : 'Noch kein Kurs angelegt'}
              </div>
            )}
            <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: isDesktop ? 12 : 8, alignItems: 'center', rowGap: 8 }}>
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => selectTab(key)}
                  style={{
                    padding: isDesktop ? '10px 15px' : '8px 10px',
                    fontSize: isDesktop ? 13 : 12.5,
                    fontWeight: screen === key ? 600 : 500,
                    color: screen === key ? colors.teal : colors.mutedStrong,
                    borderBottom: screen === key ? `2px solid ${colors.teal}` : '2px solid transparent',
                    marginBottom: -1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </button>
              ))}
              {returnScreen && (screen === 'stunde' || screen === 'ka') && (
                <button
                  onClick={backFromEditing}
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 12px 7px 9px',
                    border: `1px solid ${colors.borderStrong}`,
                    borderRadius: 8,
                    background: '#fff',
                    color: colors.mutedStrong,
                    fontSize: 12.5,
                  }}
                >
                  ‹ {returnScreen === 'student' ? 'Zurück zum Schüler' : 'Zurück zur Notenübersicht'}
                </button>
              )}
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
              <Stundenerfassung
                bundle={bundle}
                onRefresh={onRefreshBundle}
                onOpenStudent={openStudent}
                presets={presets}
                onRefreshPresets={refreshPresets}
                initialLesson={focusLesson}
              />
            )}
            {screen === 'ka' && (
              <SchriftlicheLeistungen
                bundle={bundle}
                onRefresh={onRefreshBundle}
                onOpenStudent={openStudent}
                presets={presets}
                onRefreshPresets={refreshPresets}
                initialWork={focusWork}
              />
            )}
            {screen === 'matrix' && (
              <Notenuebersicht
                bundle={bundle}
                onRefresh={onRefreshBundle}
                onOpenStudent={openStudent}
                onOpenLesson={(id, sid) => openLessonForEditing(id, 'matrix', sid)}
                onOpenWork={(id, sid) => openWorkForEditing(id, 'matrix', sid)}
                allowGradeOverride
                highlightStudentId={matrixHighlightStudentId}
              />
            )}
            {screen === 'student' && (
              <Schueleransicht
                bundle={bundle}
                studentId={studentId}
                onRefresh={onRefreshBundle}
                onBack={() => {
                  // Coming back to the Notenübersicht: highlight the student
                  // you were just looking at so it's easy to relocate.
                  if (fromScreen === 'matrix') setMatrixHighlightStudentId(studentId);
                  setScreen(fromScreen);
                }}
                onOpenLesson={(id, sid) => openLessonForEditing(id, 'student', sid)}
                onOpenWork={(id, sid) => openWorkForEditing(id, 'student', sid)}
              />
            )}
          </>
        )}
        {screen === 'schuelerverwaltung' && (
          <Schuelerverwaltung
            yearId={currentYearId}
            archived={isArchived}
            allStudents={allStudents}
            onRefreshAllStudents={refreshAllStudents}
            klassen={klassen}
            onRefreshKlassen={refreshKlassen}
          />
        )}
        {screen === 'schuljahre' && (
          <Schuljahre
            years={years}
            currentYearId={currentYearId}
            classes={klassen}
            onRefreshYears={refreshYears}
            onRefreshKlassen={refreshKlassen}
            onSelectYear={selectYear}
            openWizardSignal={yearWizardSignal}
            onWizardConsumed={() => setYearWizardSignal(false)}
          />
        )}
        {screen === 'quartalsdaten' && <Quartalsdaten yearId={currentYearId} archived={isArchived} />}
        {screen === 'export' && <Export courses={courses} allStudents={allStudents} klassen={klassen} />}
        {screen === 'backup' && <Backup />}
        {screen === 'kurs-editor' && (
          <KursEditor
            key={courseEditorNonce}
            mode={courseEditorMode}
            course={courseEditorCourse}
            allStudents={allStudents}
            klassen={klassen}
            initialSelectedIds={courseEditorEnrolledIds}
            onSubmit={submitCourseEditor}
            onDelete={deleteCourseFromEditor}
            onCancel={closeCourseEditor}
            onManageStudents={() => openVerwaltungScreen('schuelerverwaltung')}
          />
        )}
      </main>
    </div>
  );
}
