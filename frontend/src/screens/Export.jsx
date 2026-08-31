import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';
import Popover from '../components/Popover.jsx';
import {
  EXPORT_TREE,
  ALL_LEAF_KEYS,
  EXPORT_FORMATS,
  buildStudentListReport,
  buildMuendlicheNotenReport,
  buildMuendlicheBemerkungenReport,
  buildWrittenWorkReport,
  buildSchriftlichBemerkungenReport,
  buildQuartalsnotenReport,
  buildHalbjahresnotenReport,
  buildZeugnisnotenReport,
  buildAttendanceReport,
  downloadSections,
} from '../lib/exportData.js';

const label = { font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em', display: 'block', marginBottom: 8 };
const select = { padding: '7px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, background: '#fff', minWidth: 180 };
const menuOption = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', fontSize: 12.5, cursor: 'pointer', width: '100%', textAlign: 'left' };

function Checkbox({ checked, indeterminate, onChange, bold, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: bold ? 13 : 12.5, fontWeight: bold ? 600 : 400, color: colors.ink, cursor: 'pointer' }}>
      <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

function Section({ title, checked, indeterminate, onToggle, children }) {
  return (
    <div style={{ borderTop: `1px solid ${colors.divider}`, paddingTop: 12 }}>
      <Checkbox checked={checked} indeterminate={indeterminate} onChange={onToggle} bold>
        {title}
      </Checkbox>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 26, marginTop: 10 }}>{children}</div>
    </div>
  );
}

export default function Export({ courses, allStudents, klassen }) {
  const [selectedCourseIds, setSelectedCourseIds] = useState(() => new Set());
  const courseBtnRef = useRef(null);
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);

  const [schuelerlisteOn, setSchuelerlisteOn] = useState(true);
  const [schuelerFilterMode, setSchuelerFilterMode] = useState('all'); // 'all' | 'klasse' | 'jahrgang'
  const [schuelerFilterKlasseId, setSchuelerFilterKlasseId] = useState(null);
  const [schuelerFilterJahrgang, setSchuelerFilterJahrgang] = useState(null);

  const [selectedLeaves, setSelectedLeaves] = useState(() => new Set(ALL_LEAF_KEYS));

  const [loadingFormat, setLoadingFormat] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const sortedCourses = [...courses].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const sortedKlassen = [...klassen].sort((a, b) => a.jahrgang - b.jahrgang || a.name.localeCompare(b.name, 'de'));
  const jahrgaenge = [...new Set(klassen.map((k) => k.jahrgang))].sort((a, b) => a - b);
  const effectiveKlasseId = schuelerFilterKlasseId ?? sortedKlassen[0]?.id ?? null;
  const effectiveJahrgang = schuelerFilterJahrgang ?? jahrgaenge[0] ?? null;

  const markDirty = () => {
    setStatus('');
    setError('');
  };

  // -- courses dropdown --
  const allCoursesSelected = courses.length > 0 && selectedCourseIds.size === courses.length;
  const someCoursesSelected = selectedCourseIds.size > 0 && !allCoursesSelected;
  const courseLabel = !courses.length ? 'Keine Kurse angelegt' : allCoursesSelected ? 'Alle Kurse' : selectedCourseIds.size === 0 ? 'Kurse auswählen' : `${selectedCourseIds.size} von ${courses.length} Kursen`;
  const toggleAllCourses = () => {
    setSelectedCourseIds(allCoursesSelected ? new Set() : new Set(courses.map((c) => c.id)));
    markDirty();
  };
  const toggleCourse = (id) => {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    markDirty();
  };

  // -- checkbox tree helpers --
  const sectionLeaves = (sectionKey) => EXPORT_TREE.find((s) => s.key === sectionKey).children.map((c) => `${sectionKey}.${c.key}`);
  const isSectionChecked = (sectionKey) => sectionLeaves(sectionKey).every((k) => selectedLeaves.has(k));
  const isSectionIndeterminate = (sectionKey) => {
    const leaves = sectionLeaves(sectionKey);
    const n = leaves.filter((k) => selectedLeaves.has(k)).length;
    return n > 0 && n < leaves.length;
  };
  const toggleSection = (sectionKey) => {
    const leaves = sectionLeaves(sectionKey);
    const allOn = leaves.every((k) => selectedLeaves.has(k));
    setSelectedLeaves((prev) => {
      const next = new Set(prev);
      leaves.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
    markDirty();
  };
  const toggleLeaf = (key) => {
    setSelectedLeaves((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    markDirty();
  };

  const isAllChecked = schuelerlisteOn && ALL_LEAF_KEYS.every((k) => selectedLeaves.has(k));
  const isAllIndeterminate = !isAllChecked && (schuelerlisteOn || selectedLeaves.size > 0);
  const toggleAll = () => {
    const turnOn = !isAllChecked;
    setSchuelerlisteOn(turnOn);
    setSelectedLeaves(turnOn ? new Set(ALL_LEAF_KEYS) : new Set());
    markDirty();
  };

  const courseScopedSelected = selectedLeaves.size > 0;
  const somethingSelected = schuelerlisteOn || courseScopedSelected;
  // Missing courses isn't blocked by disabling the button outright — that
  // just leaves someone clicking a dead button with no feedback. Instead
  // the button stays clickable and runExport below pops up a hint the
  // moment they actually try.
  const canDownload = somethingSelected;
  const exportBtnsRef = useRef(null);

  const runExport = async (format) => {
    setError('');
    setStatus('');
    if (!somethingSelected) {
      setError('Bitte mindestens eine Kategorie auswählen.');
      return;
    }
    if (courseScopedSelected && !selectedCourseIds.size) {
      setError('Bitte mindestens einen Kurs auswählen.');
      return;
    }
    setLoadingFormat(format);
    try {
      const bundles = courseScopedSelected ? await Promise.all([...selectedCourseIds].map((id) => api.getCourseBundle(id))) : [];

      const sections = [];
      if (schuelerlisteOn) {
        const filter = schuelerFilterMode === 'all' ? null : { mode: schuelerFilterMode, klasseId: effectiveKlasseId, jahrgang: effectiveJahrgang };
        sections.push({ label: 'Schülerliste', report: buildStudentListReport(allStudents, filter) });
      }
      if (selectedLeaves.has('muendlich.noten')) sections.push({ label: 'Noten Mitarbeit', report: buildMuendlicheNotenReport(bundles) });
      if (selectedLeaves.has('muendlich.bemerkungen')) sections.push({ label: 'Bemerkungen Mitarbeit', report: buildMuendlicheBemerkungenReport(bundles) });
      if (selectedLeaves.has('schriftlich.klassenarbeit')) sections.push({ label: 'Klassenarbeiten', report: buildWrittenWorkReport(bundles, 'klassenarbeit') });
      if (selectedLeaves.has('schriftlich.test')) sections.push({ label: 'Tests', report: buildWrittenWorkReport(bundles, 'test') });
      if (selectedLeaves.has('schriftlich.sonstige')) sections.push({ label: 'Sonstige Leistungen', report: buildWrittenWorkReport(bundles, 'sonstige') });
      if (selectedLeaves.has('schriftlich.bemerkungen')) sections.push({ label: 'Bemerkungen Schriftlich', report: buildSchriftlichBemerkungenReport(bundles) });
      if (selectedLeaves.has('noten.quartalsnoten')) sections.push({ label: 'Quartalsnoten', report: buildQuartalsnotenReport(bundles) });
      if (selectedLeaves.has('noten.halbjahresnoten')) sections.push({ label: 'Halbjahresnoten', report: buildHalbjahresnotenReport(bundles) });
      if (selectedLeaves.has('noten.zeugnisnoten')) sections.push({ label: 'Zeugnisnoten', report: buildZeugnisnotenReport(bundles) });

      const attOptions = {
        verspaetungen: selectedLeaves.has('anwesenheit.verspaetungen'),
        fehlstunden: selectedLeaves.has('anwesenheit.fehlstunden'),
        unentschuldigt: selectedLeaves.has('anwesenheit.unentschuldigt'),
      };
      if (attOptions.verspaetungen || attOptions.fehlstunden || attOptions.unentschuldigt) {
        sections.push({ label: 'Anwesenheit', report: buildAttendanceReport(bundles, attOptions) });
      }

      const baseName = courseScopedSelected
        ? `Export – ${allCoursesSelected ? 'alle Kurse' : selectedCourseIds.size === 1 ? courses.find((c) => selectedCourseIds.has(c.id))?.name : `${selectedCourseIds.size} Kurse`}`
        : 'Export – Schülerliste';

      await downloadSections(format, baseName, sections);
      setStatus(`${EXPORT_FORMATS.find(([k]) => k === format)?.[1]} heruntergeladen.`);
    } catch (e) {
      setError(e.message || 'Export fehlgeschlagen.');
    } finally {
      setLoadingFormat(null);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
      <section style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ font: `500 24px/1.1 ${fonts.serif}` }}>Export</div>

        <div>
          <label style={label}>KURSE</label>
          <button
            ref={courseBtnRef}
            onClick={() => setCourseMenuOpen((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, background: '#fff', fontSize: 12.5, color: colors.ink, minWidth: 220, justifyContent: 'space-between' }}
          >
            {courseLabel}
            <span style={{ color: colors.muted }}>▾</span>
          </button>
          <Popover open={courseMenuOpen} anchorRef={courseBtnRef} onClose={() => setCourseMenuOpen(false)} width={240}>
            <div style={{ background: '#fff', border: `1px solid ${colors.borderStrong}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.18)', padding: 10 }}>
              <label style={menuOption}>
                <Checkbox checked={allCoursesSelected} indeterminate={someCoursesSelected} onChange={toggleAllCourses} bold>
                  Alle Kurse
                </Checkbox>
              </label>
              <div style={{ borderTop: `1px solid ${colors.divider}`, margin: '6px 0' }} />
              {sortedCourses.map((c) => (
                <label key={c.id} style={menuOption}>
                  <Checkbox checked={selectedCourseIds.has(c.id)} onChange={() => toggleCourse(c.id)}>
                    {c.name}
                  </Checkbox>
                </label>
              ))}
              {!sortedCourses.length && <div style={{ fontSize: 12.5, color: colors.mutedStrong, padding: '4px 4px' }}>Noch kein Kurs angelegt.</div>}
            </div>
          </Popover>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ paddingBottom: 12 }}>
            <Checkbox checked={isAllChecked} indeterminate={isAllIndeterminate} onChange={toggleAll} bold>
              Alle auswählen
            </Checkbox>
          </div>

          <Section title="Schülerliste" checked={schuelerlisteOn} onToggle={() => { setSchuelerlisteOn((v) => !v); markDirty(); }}>
            {schuelerlisteOn && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    ['all', 'Alle'],
                    ['klasse', 'Nach Klasse'],
                    ['jahrgang', 'Nach Jahrgang'],
                  ].map(([key, text]) => (
                    <button
                      key={key}
                      onClick={() => { setSchuelerFilterMode(key); markDirty(); }}
                      style={{
                        padding: '5px 11px',
                        borderRadius: 99,
                        fontSize: 11.5,
                        fontWeight: 500,
                        border: `1px solid ${schuelerFilterMode === key ? colors.teal : colors.borderStrong}`,
                        background: schuelerFilterMode === key ? colors.teal : '#fff',
                        color: schuelerFilterMode === key ? '#fff' : colors.mutedStrong,
                      }}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                {schuelerFilterMode === 'klasse' && (
                  <select value={effectiveKlasseId ?? ''} onChange={(e) => { setSchuelerFilterKlasseId(Number(e.target.value)); markDirty(); }} style={select}>
                    {sortedKlassen.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                )}
                {schuelerFilterMode === 'jahrgang' && (
                  <select value={effectiveJahrgang ?? ''} onChange={(e) => { setSchuelerFilterJahrgang(Number(e.target.value)); markDirty(); }} style={select}>
                    {jahrgaenge.map((j) => (
                      <option key={j} value={j}>
                        Jahrgang {j}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </Section>

          {EXPORT_TREE.map((section) => (
            <Section
              key={section.key}
              title={section.label}
              checked={isSectionChecked(section.key)}
              indeterminate={isSectionIndeterminate(section.key)}
              onToggle={() => toggleSection(section.key)}
            >
              {section.children.map((child) => {
                const leafKey = `${section.key}.${child.key}`;
                return (
                  <Checkbox key={leafKey} checked={selectedLeaves.has(leafKey)} onChange={() => toggleLeaf(leafKey)}>
                    {child.label}
                  </Checkbox>
                );
              })}
            </Section>
          ))}
        </div>

        <div>
          <label style={label}>EXPORT ALS</label>
          <div ref={exportBtnsRef} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {EXPORT_FORMATS.map(([key, text]) => (
              <button
                key={key}
                onClick={() => runExport(key)}
                disabled={!canDownload || !!loadingFormat}
                style={{
                  padding: '9px 16px',
                  borderRadius: 8,
                  background: colors.teal,
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 500,
                  opacity: !canDownload || !!loadingFormat ? 0.6 : 1,
                }}
              >
                {loadingFormat === key ? 'Wird erstellt …' : text}
              </button>
            ))}
          </div>
          <Popover open={!!error} anchorRef={exportBtnsRef} onClose={() => setError('')} width={260}>
            <div style={{ background: '#fff', border: `1px solid ${colors.redBorder}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.18)', padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 13, color: colors.red, flex: 1 }}>{error}</span>
              <button onClick={() => setError('')} style={{ fontSize: 13, color: colors.muted, flex: 'none' }}>
                ✕
              </button>
            </div>
          </Popover>
          {status && <div style={{ fontSize: 12.5, color: colors.green, marginTop: 10 }}>{status}</div>}
        </div>
      </section>
    </div>
  );
}
