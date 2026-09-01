import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';
import { studentDisplayName } from '../lib/gradeMath.js';
import { parseStudentsFile, SUPPORTED_IMPORT_FORMATS } from '../lib/studentImport.js';
import { useViewport } from '../lib/useViewport.js';

const selectStyle = { padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, background: '#fff' };

// A checkbox whose `indeterminate` (some but not all rows checked) can only be
// set on the DOM node, not via a prop.
function SelectAllCheckbox({ checked, indeterminate, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label="Alle auswählen" />;
}

const SORT_OPTIONS = [
  { value: 'lastName', label: 'Nachname' },
  { value: 'firstName', label: 'Vorname' },
  { value: 'klasse', label: 'Klasse' },
];

function sortStudentsBy(students, sortBy) {
  return [...students].sort((a, b) => {
    if (sortBy === 'firstName') {
      return a.first_name.localeCompare(b.first_name, 'de') || a.last_name.localeCompare(b.last_name, 'de');
    }
    if (sortBy === 'klasse') {
      return (
        (a.klasse_name || '').localeCompare(b.klasse_name || '', 'de') ||
        a.last_name.localeCompare(b.last_name, 'de') ||
        a.first_name.localeCompare(b.first_name, 'de')
      );
    }
    return a.last_name.localeCompare(b.last_name, 'de') || a.first_name.localeCompare(b.first_name, 'de');
  });
}

const nameKey = (first, last) => `${String(first).trim().toLowerCase()} ${String(last).trim().toLowerCase()}`;

// allStudents here are the *year's* students (each carries class_id +
// klasse_name; class_id null = Ohne Klasse). klassen are the year's classes.
export default function Schuelerverwaltung({ yearId, archived, allStudents, onRefreshAllStudents, klassen, onRefreshKlassen }) {
  const { isMobile } = useViewport();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [klasseName, setKlasseName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editKlasseName, setEditKlasseName] = useState('');
  const [sortBy, setSortBy] = useState('lastName');
  const [filterKlasse, setFilterKlasse] = useState(''); // '' = alle; 'none' = Ohne Klasse; else class id (string)
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [importPreview, setImportPreview] = useState(null); // [{ firstName, lastName, klasse, skip, action, linkId, matches }]
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [showFormats, setShowFormats] = useState(false);
  const fileInputRef = useRef(null);

  const sorted = sortStudentsBy(allStudents, sortBy);
  const sortedKlassen = [...klassen].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const ohneKlasseCount = sorted.filter((s) => s.class_id == null).length;
  const visible =
    filterKlasse === '' ? sorted
    : filterKlasse === 'none' ? sorted.filter((s) => s.class_id == null)
    : sorted.filter((s) => String(s.class_id) === filterKlasse);

  const toggleSelected = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selectedIds.has(s.id));
  const someVisibleSelected = visible.some((s) => selectedIds.has(s.id));
  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visible.forEach((s) => (allVisibleSelected ? next.delete(s.id) : next.add(s.id)));
      return next;
    });
  const selectedVisibleCount = visible.filter((s) => selectedIds.has(s.id)).length;

  // Removing from the list removes the student from THIS year only -- the
  // person stays in the pool and in other years.
  const deleteSelected = async () => {
    const ids = visible.filter((s) => selectedIds.has(s.id)).map((s) => s.id);
    if (!ids.length) return;
    for (const id of ids) await api.removeStudentFromYear(id, yearId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    onRefreshAllStudents();
  };

  const addStudent = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    await api.createStudent({ firstName: firstName.trim(), lastName: lastName.trim(), yearId, className: klasseName });
    setFirstName('');
    setLastName('');
    setKlasseName('');
    onRefreshAllStudents();
    onRefreshKlassen();
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditFirst(s.first_name);
    setEditLast(s.last_name);
    setEditKlasseName(s.klasse_name || '');
  };

  const saveEdit = async () => {
    await api.updateStudent(editingId, { firstName: editFirst.trim(), lastName: editLast.trim(), className: editKlasseName, yearId });
    setEditingId(null);
    onRefreshAllStudents();
    onRefreshKlassen();
  };

  const existingNameKeys = new Set(allStudents.map((s) => nameKey(s.first_name, s.last_name)));

  const pickImportFile = () => fileInputRef.current?.click();

  const onImportFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError('');
    setImportPreview(null);
    try {
      const rows = await parseStudentsFile(file);
      if (!rows.length) {
        setImportError('Keine Schüler:innen in der Datei gefunden.');
        return;
      }
      // Ask the backend which rows already exist as people in the pool, so we
      // can offer "same person?" instead of blindly creating duplicates.
      const results = await api.matchStudents(rows.map((r) => ({ firstName: r.firstName, lastName: r.lastName })));
      setImportPreview(
        rows.map((r, i) => {
          const matches = results[i]?.matches || [];
          const alreadyInYear = existingNameKeys.has(nameKey(r.firstName, r.lastName));
          return {
            ...r,
            alreadyInYear, // already a member of this year: not importable at all
            skip: alreadyInYear,
            matches,
            action: matches.length ? 'link' : 'create', // default to linking a known person
            linkId: matches[0]?.id ?? null,
          };
        })
      );
    } catch {
      setImportError('Datei konnte nicht gelesen werden. Unterstützt werden CSV, Excel und TSV/TXT.');
    }
  };

  const patchImportRow = (i, patch) => setImportPreview((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  // Rows whose name already exists in the year can't be imported again, so
  // their checkbox is locked off — toggling is a no-op for them.
  const toggleImportRow = (i) => setImportPreview((rows) => rows.map((r, idx) => (idx === i && !r.alreadyInYear ? { ...r, skip: !r.skip } : r)));

  const cancelImport = () => {
    setImportPreview(null);
    setImportError('');
  };

  const confirmImport = async () => {
    const toProcess = importPreview.filter((r) => !r.skip);
    if (!toProcess.length) return;
    setImporting(true);
    try {
      for (const r of toProcess) {
        if (r.action === 'link' && r.linkId) {
          await api.linkStudentToYear(r.linkId, { yearId, className: r.klasse || '' });
        } else {
          await api.createStudent({ firstName: r.firstName, lastName: r.lastName, yearId, className: r.klasse || '' });
        }
      }
      setImportPreview(null);
      onRefreshAllStudents();
      onRefreshKlassen();
    } finally {
      setImporting(false);
    }
  };

  const inputStyle = { flex: 1, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
      <section style={{ maxWidth: 680 }}>
        <div style={{ font: `500 24px/1.1 ${fonts.serif}`, marginBottom: 4 }}>Schülerdaten</div>
        <div style={{ fontSize: 12.5, color: colors.mutedStrong, marginBottom: 16 }}>
          {allStudents.length} Schüler:in{allStudents.length === 1 ? '' : 'nen'} in diesem Schuljahr. Klasse eintippen (z. B. 10b) — neue Klassen werden automatisch angelegt.
        </div>

        {!archived && (
          <form onSubmit={(e) => { e.preventDefault(); addStudent(); }} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 10 }}>
            <input placeholder="Vorname" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
            <input placeholder="Nachname" value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
            <input list="klassen-list" placeholder="Klasse (optional)" value={klasseName} onChange={(e) => setKlasseName(e.target.value)} style={inputStyle} />
            <button type="submit" style={{ padding: '8px 15px', borderRadius: 7, background: colors.teal, color: '#fff', fontSize: 12.5, fontWeight: 500 }}>
              Hinzufügen
            </button>
          </form>
        )}
        <datalist id="klassen-list">
          {sortedKlassen.map((k) => (
            <option key={k.id} value={k.name} />
          ))}
        </datalist>

        {!archived && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: showFormats ? 8 : 14, flexWrap: 'wrap' }}>
            <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods" onChange={onImportFileChosen} style={{ display: 'none' }} />
            <button onClick={pickImportFile} style={{ padding: '7px 13px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, background: '#fff', fontSize: 12, fontWeight: 500, color: colors.mutedStrong }}>
              CSV/Excel importieren
            </button>
            <button
              type="button"
              onClick={() => setShowFormats((v) => !v)}
              aria-expanded={showFormats}
              style={{ padding: '7px 11px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, background: '#fff', fontSize: 12, color: colors.mutedStrong }}
            >
              {showFormats ? 'Formate ausblenden' : 'Welche Dateien werden erkannt?'}
            </button>
            {importError && <span style={{ fontSize: 12, color: colors.red }}>{importError}</span>}
          </div>
        )}

        {showFormats && (
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.borderCard}`, borderRadius: 11, padding: 14, marginBottom: 16, fontSize: 12.5, lineHeight: 1.5, color: colors.ink }}>
            <div style={{ marginBottom: 8 }}>
              <b>Dateitypen:</b> {SUPPORTED_IMPORT_FORMATS.fileTypes}
              <br />
              <b>Trennzeichen:</b> {SUPPORTED_IMPORT_FORMATS.separators}
            </div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Mit Überschriftzeile</div>
            <ul style={{ margin: '0 0 8px 18px', padding: 0 }}>
              {SUPPORTED_IMPORT_FORMATS.withHeader.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Ohne Überschriftzeile (nach Spaltenanzahl)</div>
            <ul style={{ margin: '0 0 8px 18px', padding: 0 }}>
              {SUPPORTED_IMPORT_FORMATS.withoutHeader.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <div style={{ color: colors.mutedStrong }}>
              {SUPPORTED_IMPORT_FORMATS.notes.map((t) => (
                <div key={t}>• {t}</div>
              ))}
            </div>
          </div>
        )}

        {importPreview && (
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.borderCard}`, borderRadius: 11, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {importPreview.length} Zeile{importPreview.length === 1 ? '' : 'n'} gefunden — bereits im Jahr vorhandene werden übersprungen.
            </div>
            <div style={{ fontSize: 11.5, color: colors.mutedStrong, marginBottom: 10 }}>
              Namen kannst du vor dem Import noch korrigieren. Ist eine Person schon aus einem anderen Jahr bekannt, wähle „gleiche Person" (verknüpft die Historie) oder „neu anlegen".
            </div>
            <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 10 }}>
              {importPreview.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', borderTop: i ? `1px solid ${colors.divider}` : undefined }}>
                  <input type="checkbox" checked={!r.skip} disabled={r.alreadyInYear} onChange={() => toggleImportRow(i)} />
                  <input value={r.lastName} disabled={r.alreadyInYear} onChange={(e) => patchImportRow(i, { lastName: e.target.value })} style={{ width: 130, padding: '4px 6px', border: `1px solid ${colors.borderStrong}`, borderRadius: 5, fontSize: 12, opacity: r.skip ? 0.5 : 1 }} />
                  <input value={r.firstName} disabled={r.alreadyInYear} onChange={(e) => patchImportRow(i, { firstName: e.target.value })} style={{ width: 120, padding: '4px 6px', border: `1px solid ${colors.borderStrong}`, borderRadius: 5, fontSize: 12, opacity: r.skip ? 0.5 : 1 }} />
                  {r.klasse ? <span style={{ fontSize: 11, color: colors.muted }}>· {r.klasse}</span> : null}
                  <span style={{ flex: 1 }} />
                  {r.alreadyInYear ? (
                    <span style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic' }}>ist bereits eingefügt</span>
                  ) : r.matches.length ? (
                    <select
                      value={r.action}
                      onChange={(e) => patchImportRow(i, { action: e.target.value })}
                      title={`Bekannt aus: ${r.matches.map((m) => m.years).filter(Boolean).join(' / ') || 'Pool'}`}
                      style={{ fontSize: 11.5, padding: '3px 5px', border: `1px solid ${colors.borderStrong}`, borderRadius: 5, background: '#fff' }}
                    >
                      <option value="link">gleiche Person ({r.matches[0].years || 'Pool'})</option>
                      <option value="create">neu anlegen</option>
                    </select>
                  ) : null}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={confirmImport}
                disabled={importing || !importPreview.some((r) => !r.skip)}
                style={{ padding: '7px 13px', borderRadius: 7, background: colors.teal, color: '#fff', fontSize: 12.5, fontWeight: 500, opacity: importing ? 0.6 : 1 }}
              >
                {importing ? 'Importiere …' : `${importPreview.filter((r) => !r.skip).length} importieren`}
              </button>
              <button onClick={cancelImport} disabled={importing} style={{ padding: '7px 13px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, fontSize: 12.5 }}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: colors.mutedStrong }}>Sortieren nach:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: colors.mutedStrong, marginLeft: 6 }}>Filtern nach:</span>
          <select value={filterKlasse} onChange={(e) => setFilterKlasse(e.target.value)} style={selectStyle}>
            <option value="">Alle Klassen</option>
            <option value="none">Ohne Klasse ({ohneKlasseCount})</option>
            {sortedKlassen.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          {!archived && (
            <button
              onClick={deleteSelected}
              disabled={!selectedVisibleCount}
              title="Aus diesem Schuljahr entfernen (Person bleibt im Pool)"
              style={{ marginLeft: 'auto', padding: '7px 13px', borderRadius: 7, border: `1px solid ${selectedVisibleCount ? colors.redBorder : colors.borderStrong}`, background: selectedVisibleCount ? colors.redBg : '#fff', color: selectedVisibleCount ? colors.red : colors.faint, fontSize: 12.5, fontWeight: 500 }}
            >
              {selectedVisibleCount ? `${selectedVisibleCount} entfernen` : 'Entfernen'}
            </button>
          )}
        </div>

        {!archived && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12.5, fontWeight: 500, color: colors.mutedStrong, cursor: 'pointer' }}>
            <SelectAllCheckbox checked={allVisibleSelected} indeterminate={someVisibleSelected && !allVisibleSelected} onChange={toggleSelectAll} />
            Alle auswählen
          </label>
        )}

        <div style={{ border: `1px solid ${colors.borderCard}`, borderRadius: 11, background: colors.cardBg }}>
          {visible.map((s) =>
            editingId === s.id ? (
              <div key={s.id} style={{ padding: '9px 14px', borderTop: `1px solid ${colors.divider}` }}>
                <form onSubmit={(e) => { e.preventDefault(); saveEdit(); }} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
                  <input value={editLast} onChange={(e) => setEditLast(e.target.value)} style={{ flex: 1, padding: '6px 8px', border: `1px solid ${colors.borderStrong}`, borderRadius: 6, fontSize: 12.5 }} />
                  <input value={editFirst} onChange={(e) => setEditFirst(e.target.value)} style={{ flex: 1, padding: '6px 8px', border: `1px solid ${colors.borderStrong}`, borderRadius: 6, fontSize: 12.5 }} />
                  <input list="klassen-list" placeholder="Klasse (leer = Ohne Klasse)" value={editKlasseName} onChange={(e) => setEditKlasseName(e.target.value)} style={{ flex: 1, padding: '6px 8px', border: `1px solid ${colors.borderStrong}`, borderRadius: 6, fontSize: 12.5 }} />
                  <button type="submit" style={{ padding: '6px 12px', borderRadius: 6, background: colors.teal, color: '#fff', fontSize: 12 }}>
                    Speichern
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${colors.borderStrong}`, fontSize: 12 }}>
                    Abbrechen
                  </button>
                </form>
              </div>
            ) : (
              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: `1px solid ${colors.divider}`, fontSize: 13, flexWrap: 'wrap', cursor: 'pointer', background: selectedIds.has(s.id) ? colors.highlightBg : undefined }}>
                {!archived && <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelected(s.id)} aria-label={`${studentDisplayName(s)} auswählen`} />}
                <span style={{ width: isMobile ? 140 : 200, flex: 'none', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{studentDisplayName(s)}</span>
                <span style={{ fontSize: 11.5, color: s.klasse_name ? colors.muted : colors.faint }}>{s.klasse_name || 'Ohne Klasse'}</span>
                <span style={{ flex: 1 }} />
                {!archived && (
                  <button type="button" onClick={() => startEdit(s)} style={{ fontSize: 12, color: colors.teal }}>
                    Bearbeiten
                  </button>
                )}
              </label>
            )
          )}
          {!visible.length && (
            <div style={{ padding: '10px 14px', fontSize: 12.5, color: colors.mutedStrong }}>
              {filterKlasse ? 'Keine Schüler:innen in dieser Auswahl.' : 'Noch keine Schüler:innen in diesem Schuljahr.'}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
