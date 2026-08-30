import { useRef, useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';
import { studentDisplayName } from '../lib/gradeMath.js';
import { parseStudentsFile } from '../lib/studentImport.js';

const th = { font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em', textAlign: 'left', padding: '8px 12px' };
const td = { padding: '9px 12px', borderTop: `1px solid ${colors.divider}`, fontSize: 13 };
const selectStyle = { padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, background: '#fff' };

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

export default function Schuelerverwaltung({ allStudents, onRefreshAllStudents, klassen, onRefreshKlassen }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [klasseName, setKlasseName] = useState('');
  const [klasseError, setKlasseError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editKlasseName, setEditKlasseName] = useState('');
  const [sortBy, setSortBy] = useState('lastName');
  const [importPreview, setImportPreview] = useState(null); // [{ firstName, lastName, skip }]
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const sorted = sortStudentsBy(allStudents, sortBy);
  const sortedKlassen = [...klassen].sort((a, b) => a.jahrgang - b.jahrgang || a.name.localeCompare(b.name, 'de'));

  // Resolves a typed class name to a klasseId, creating the class on the fly
  // if it doesn't exist yet. Jahrgang is derived from the class name's
  // leading digits (e.g. "9a" -> 9), matching the existing naming convention.
  const resolveKlasseId = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return { klasseId: null };
    const existing = klassen.find((k) => k.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return { klasseId: existing.id };
    const jahrgang = Number((trimmed.match(/^\d+/) || [])[0]);
    if (!jahrgang) return { error: `Jahrgang konnte aus "${trimmed}" nicht erkannt werden, z. B. "9a".` };
    const created = await api.createKlasse({ name: trimmed, jahrgang });
    await onRefreshKlassen();
    return { klasseId: created.id };
  };

  const addStudent = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    setKlasseError('');
    const { klasseId, error } = await resolveKlasseId(klasseName);
    if (error) { setKlasseError(error); return; }
    await api.createStudent({ firstName: firstName.trim(), lastName: lastName.trim(), klasseId });
    setFirstName('');
    setLastName('');
    setKlasseName('');
    onRefreshAllStudents();
  };

  const existingNameKeys = new Set(allStudents.map((s) => `${s.first_name.trim().toLowerCase()} ${s.last_name.trim().toLowerCase()}`));

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
      setImportPreview(
        rows.map((r) => ({ ...r, skip: existingNameKeys.has(`${r.firstName.toLowerCase()} ${r.lastName.toLowerCase()}`) }))
      );
    } catch {
      setImportError('Datei konnte nicht gelesen werden. Unterstützt werden CSV, XLSX und XLS.');
    }
  };

  const toggleImportRow = (i) => setImportPreview((rows) => rows.map((r, idx) => (idx === i ? { ...r, skip: !r.skip } : r)));

  const cancelImport = () => {
    setImportPreview(null);
    setImportError('');
  };

  const confirmImport = async () => {
    const toCreate = importPreview.filter((r) => !r.skip);
    if (!toCreate.length) return;
    setImporting(true);
    try {
      for (const r of toCreate) {
        await api.createStudent({ firstName: r.firstName, lastName: r.lastName });
      }
      setImportPreview(null);
      onRefreshAllStudents();
    } finally {
      setImporting(false);
    }
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditFirst(s.first_name);
    setEditLast(s.last_name);
    setEditKlasseName(s.klasse_name || '');
    setKlasseError('');
  };

  const saveEdit = async () => {
    setKlasseError('');
    const { klasseId, error } = await resolveKlasseId(editKlasseName);
    if (error) { setKlasseError(error); return; }
    await api.updateStudent(editingId, { firstName: editFirst.trim(), lastName: editLast.trim(), klasseId });
    setEditingId(null);
    onRefreshAllStudents();
  };

  const removeStudent = async (id) => {
    await api.deleteStudent(id);
    onRefreshAllStudents();
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
      <section style={{ maxWidth: 680 }}>
        <div style={{ font: `500 24px/1.1 ${fonts.serif}`, marginBottom: 16 }}>Schülerdaten</div>
        <form onSubmit={(e) => { e.preventDefault(); addStudent(); }} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input placeholder="Vorname" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <input placeholder="Nachname" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <input
            list="klassen-list"
            placeholder="Klasse, z. B. 9a"
            value={klasseName}
            onChange={(e) => setKlasseName(e.target.value)}
            style={{ flex: 1, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }}
          />
          <button type="submit" style={{ padding: '8px 15px', borderRadius: 7, background: colors.teal, color: '#fff', fontSize: 12.5, fontWeight: 500 }}>
            Hinzufügen
          </button>
        </form>
        <datalist id="klassen-list">
          {sortedKlassen.map((k) => (
            <option key={k.id} value={k.name} />
          ))}
        </datalist>

        {klasseError && <div style={{ fontSize: 12, color: colors.red, marginBottom: 14 }}>{klasseError}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={onImportFileChosen} style={{ display: 'none' }} />
          <button onClick={pickImportFile} style={{ padding: '7px 13px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, background: '#fff', fontSize: 12, fontWeight: 500, color: colors.mutedStrong }}>
            CSV/Excel importieren
          </button>
          {importError && <span style={{ fontSize: 12, color: colors.red }}>{importError}</span>}
        </div>

        {importPreview && (
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.borderCard}`, borderRadius: 11, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              {importPreview.length} Schüler:in{importPreview.length === 1 ? '' : 'nen'} gefunden — bereits vorhandene sind vorab abgewählt.
            </div>
            <div style={{ maxHeight: 220, overflow: 'auto', marginBottom: 10 }}>
              {importPreview.map((r, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 12.5, color: r.skip ? colors.muted : colors.ink }}>
                  <input type="checkbox" checked={!r.skip} onChange={() => toggleImportRow(i)} />
                  <span>{r.lastName}, {r.firstName}</span>
                  {r.skip && <span style={{ fontSize: 11, color: colors.muted }}>(existiert bereits)</span>}
                </label>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: colors.mutedStrong }}>Sortieren nach:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', background: colors.cardBg, border: `1px solid ${colors.borderCard}`, borderRadius: 11, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#faf8f4' }}>
              <th style={th}>NACHNAME, VORNAME</th>
              <th style={th}>KLASSE</th>
              <th style={{ ...th, width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.id}>
                {editingId === s.id ? (
                  <td style={td} colSpan={3}>
                    <form onSubmit={(e) => { e.preventDefault(); saveEdit(); }} style={{ display: 'flex', gap: 8 }}>
                      <input value={editLast} onChange={(e) => setEditLast(e.target.value)} style={{ flex: 1, padding: '6px 8px', border: `1px solid ${colors.borderStrong}`, borderRadius: 6, fontSize: 12.5 }} />
                      <input value={editFirst} onChange={(e) => setEditFirst(e.target.value)} style={{ flex: 1, padding: '6px 8px', border: `1px solid ${colors.borderStrong}`, borderRadius: 6, fontSize: 12.5 }} />
                      <input
                        list="klassen-list"
                        placeholder="Klasse, z. B. 9a"
                        value={editKlasseName}
                        onChange={(e) => setEditKlasseName(e.target.value)}
                        style={{ flex: 1, padding: '6px 8px', border: `1px solid ${colors.borderStrong}`, borderRadius: 6, fontSize: 12.5 }}
                      />
                      <button type="submit" style={{ padding: '6px 12px', borderRadius: 6, background: colors.teal, color: '#fff', fontSize: 12 }}>
                        Speichern
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${colors.borderStrong}`, fontSize: 12 }}>
                        Abbrechen
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td style={{ ...td, fontWeight: 500 }}>{studentDisplayName(s)}</td>
                    <td style={td}>{s.klasse_name || '–'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button onClick={() => startEdit(s)} style={{ fontSize: 12, color: colors.teal, marginRight: 12 }}>
                        Bearbeiten
                      </button>
                      <button onClick={() => removeStudent(s.id)} style={{ fontSize: 12, color: colors.red }}>
                        Löschen
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td style={td} colSpan={3}>
                  Noch keine Schüler:innen angelegt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
