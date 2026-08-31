import { useEffect, useRef, useState } from 'react';
import { colors, fonts } from '../theme.js';
import { sortStudents, studentDisplayName } from '../lib/gradeMath.js';
import { submitOnEnter } from '../lib/keys.js';

const label = { font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em', display: 'block', marginBottom: 5 };
const field = { padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, width: '100%' };
const select = { padding: '7px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, background: '#fff' };

const ADD_SORT_OPTIONS = [
  { value: 'lastName', label: 'Nachname' },
  { value: 'firstName', label: 'Vorname' },
  { value: 'klasse', label: 'Klasse' },
];

// Same sort behavior as Schülerverwaltung, so picking who to add to a
// course sorts the same way as the whole-school roster does.
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

// "Alle auswählen" checkbox shown above a checklist. `indeterminate` (some
// but not all rows checked) can't be set through a prop, so it's applied to
// the DOM node via a ref.
function SelectAllCheckbox({ checked, indeterminate, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
      <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function StudentRow({ student, checked, onToggle }) {
  const klasseLabel = student.klasse_name || '–';
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: `1px solid ${colors.divider}`, fontSize: 13, cursor: onToggle ? 'pointer' : 'default' }}>
      {onToggle && <input type="checkbox" checked={checked} onChange={onToggle} />}
      <span style={{ fontWeight: 500 }}>{studentDisplayName(student)}</span>
      <span style={{ fontSize: 11.5, color: colors.muted }}>{klasseLabel}</span>
      <span style={{ flex: 1 }} />
    </label>
  );
}

// Full-screen course creator/editor: a name (and, in edit mode, delete) at
// the top, and below it the course's own roster — just the enrolled
// students, no checkboxes, since that's not a selection to make every time
// you open this screen. Changing who's enrolled is its own explicit
// action: "Schüler entfernen" turns the same list into a checklist
// (pre-checked, since removing is the point of being here) to remove some
// of them, "Schüler hinzufügen" opens the rest of the school's roster
// (sortable like Schülerverwaltung) to check in whoever's joining.
export default function KursEditor({ mode, course, allStudents, klassen, initialSelectedIds, onSubmit, onDelete, onCancel, onManageStudents }) {
  const [name, setName] = useState(course?.name || '');
  const [selectedIds, setSelectedIds] = useState(new Set(initialSelectedIds));
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Creating a course drops you straight into "Schüler hinzufügen" -- adding
  // students is the first thing you want to do on a brand-new course.
  const [rosterMode, setRosterMode] = useState(mode === 'create' ? 'add' : 'view'); // 'view' | 'remove' | 'add'
  const [removeChecked, setRemoveChecked] = useState(new Set());
  const [addChecked, setAddChecked] = useState(new Set());
  const [addSortBy, setAddSortBy] = useState('lastName');
  const [addFilterKlasse, setAddFilterKlasse] = useState(''); // '' = alle Klassen; else a klasse id (as string)

  const enrolled = sortStudents(allStudents.filter((s) => selectedIds.has(s.id)));
  const notEnrolled = sortStudentsBy(allStudents.filter((s) => !selectedIds.has(s.id)), addSortBy);
  // Add mode can additionally narrow the not-enrolled list to a single Klasse.
  const notEnrolledFiltered = addFilterKlasse ? notEnrolled.filter((s) => String(s.klasse_id) === addFilterKlasse) : notEnrolled;

  // "Alle auswählen" derivations, one per checklist. The add-mode toggle only
  // ever touches the currently *visible* (filtered) rows, so a selection made
  // under one Klasse filter survives switching to another.
  const removeAllChecked = enrolled.length > 0 && enrolled.every((s) => removeChecked.has(s.id));
  const removeSomeChecked = enrolled.some((s) => removeChecked.has(s.id));
  const toggleRemoveAll = () => setRemoveChecked(removeAllChecked ? new Set() : new Set(enrolled.map((s) => s.id)));
  const addAllChecked = notEnrolledFiltered.length > 0 && notEnrolledFiltered.every((s) => addChecked.has(s.id));
  const addSomeChecked = notEnrolledFiltered.some((s) => addChecked.has(s.id));
  const toggleAddAll = () =>
    setAddChecked((prev) => {
      const next = new Set(prev);
      notEnrolledFiltered.forEach((s) => (addAllChecked ? next.delete(s.id) : next.add(s.id)));
      return next;
    });

  const startRemoving = () => {
    setRemoveChecked(new Set(selectedIds));
    setRosterMode('remove');
  };
  const toggleRemoveChecked = (id) =>
    setRemoveChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const confirmRemove = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      removeChecked.forEach((id) => next.delete(id));
      return next;
    });
    setRosterMode('view');
  };

  const startAdding = () => {
    setAddChecked(new Set());
    setAddFilterKlasse('');
    setRosterMode('add');
  };
  const toggleAddChecked = (id) =>
    setAddChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const confirmAdd = () => {
    setSelectedIds((prev) => new Set([...prev, ...addChecked]));
    setRosterMode('view');
  };

  const cancelRoster = () => setRosterMode('view');

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), studentIds: selectedIds });
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ font: `500 24px/1.1 ${fonts.serif}` }}>{mode === 'create' ? 'Neuer Kurs' : 'Kurs bearbeiten'}</div>
        {mode === 'edit' &&
          (confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: colors.red }}>Kurs wirklich löschen?</span>
              <button onClick={onDelete} style={{ padding: '8px 14px', borderRadius: 7, background: colors.red, color: '#fff', fontSize: 12.5, fontWeight: 500 }}>
                Ja, löschen
              </button>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: '8px 14px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, fontSize: 12.5 }}>
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ padding: '8px 14px', borderRadius: 7, border: `1px solid ${colors.redBorder}`, color: colors.red, background: colors.redBg, fontSize: 12.5, fontWeight: 500 }}
            >
              Kurs löschen
            </button>
          ))}
      </div>

      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 1, maxWidth: 360 }}>
          <label style={label}>KURSNAME</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={submitOnEnter(submit)} style={field} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        {rosterMode === 'view' && (
          <>
            <span style={{ fontSize: 12, color: colors.mutedStrong }}>{selectedIds.size} Schüler:in{selectedIds.size === 1 ? '' : 'nen'} im Kurs</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button onClick={startAdding} style={{ padding: '7px 13px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, fontSize: 12.5, fontWeight: 500, color: colors.teal }}>
                + Schüler hinzufügen
              </button>
              <button
                onClick={startRemoving}
                disabled={!selectedIds.size}
                style={{ padding: '7px 13px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, fontSize: 12.5, fontWeight: 500, color: selectedIds.size ? colors.red : colors.faint }}
              >
                − Schüler entfernen
              </button>
            </span>
          </>
        )}
        {rosterMode === 'remove' && (
          <>
            <SelectAllCheckbox
              checked={removeAllChecked}
              indeterminate={removeSomeChecked && !removeAllChecked}
              onChange={toggleRemoveAll}
              label="Alle auswählen"
            />
            <span style={{ fontSize: 12.5, color: colors.mutedStrong }}>Angehakte werden nach dem Bestätigen entfernt</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: colors.mutedStrong }}>{removeChecked.size} ausgewählt</span>
          </>
        )}
        {rosterMode === 'add' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <label style={label}>SORTIEREN</label>
                <select value={addSortBy} onChange={(e) => setAddSortBy(e.target.value)} style={select}>
                  {ADD_SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>NACH KLASSE FILTERN</label>
                <select value={addFilterKlasse} onChange={(e) => setAddFilterKlasse(e.target.value)} style={select}>
                  <option value="">Alle Klassen</option>
                  {klassen.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: colors.mutedStrong }}>{addChecked.size} ausgewählt</span>
            </div>
            {/* Select-all sits on its own row below the sort/filter controls. */}
            <SelectAllCheckbox
              checked={addAllChecked}
              indeterminate={addSomeChecked && !addAllChecked}
              onChange={toggleAddAll}
              label="Alle auswählen"
            />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: `1px solid ${colors.borderCard}`, borderRadius: 11, background: colors.cardBg }}>
        {rosterMode === 'view' &&
          (enrolled.length ? (
            enrolled.map((s) => <StudentRow key={s.id} student={s} />)
          ) : (
            <div style={{ padding: '10px 14px', fontSize: 12.5, color: colors.mutedStrong }}>Noch keine Schüler:innen im Kurs.</div>
          ))}
        {rosterMode === 'remove' &&
          enrolled.map((s) => (
            <StudentRow key={s.id} student={s} checked={removeChecked.has(s.id)} onToggle={() => toggleRemoveChecked(s.id)} />
          ))}
        {rosterMode === 'add' &&
          (notEnrolledFiltered.length ? (
            notEnrolledFiltered.map((s) => (
              <StudentRow key={s.id} student={s} checked={addChecked.has(s.id)} onToggle={() => toggleAddChecked(s.id)} />
            ))
          ) : (
            <div style={{ padding: '10px 14px', fontSize: 12.5, color: colors.mutedStrong }}>
              {addFilterKlasse ? 'Keine hinzufügbaren Schüler:innen in dieser Klasse.' : 'Alle Schüler:innen sind bereits im Kurs.'}
            </div>
          ))}
      </div>

      {rosterMode === 'remove' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={confirmRemove}
            disabled={!removeChecked.size}
            style={{ padding: '9px 18px', borderRadius: 8, background: removeChecked.size ? colors.red : colors.divider, color: removeChecked.size ? '#fff' : colors.faint, fontSize: 13, fontWeight: 500 }}
          >
            {removeChecked.size} entfernen
          </button>
          <button onClick={cancelRoster} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${colors.borderStrong}`, fontSize: 13 }}>
            Abbrechen
          </button>
        </div>
      )}
      {rosterMode === 'add' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={confirmAdd}
            disabled={!addChecked.size}
            style={{ padding: '9px 18px', borderRadius: 8, background: addChecked.size ? colors.teal : colors.divider, color: addChecked.size ? '#fff' : colors.faint, fontSize: 13, fontWeight: 500 }}
          >
            {addChecked.size} hinzufügen
          </button>
          <button onClick={cancelRoster} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${colors.borderStrong}`, fontSize: 13 }}>
            Abbrechen
          </button>
        </div>
      )}

      {rosterMode === 'view' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={submit} style={{ padding: '9px 18px', borderRadius: 8, background: colors.teal, color: '#fff', fontSize: 13, fontWeight: 500 }}>
            {mode === 'create' ? 'Anlegen' : 'Speichern'}
          </button>
          <button onClick={onCancel} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${colors.borderStrong}`, fontSize: 13 }}>
            Abbrechen
          </button>
          {onManageStudents && (
            <button
              onClick={onManageStudents}
              style={{ marginLeft: 'auto', padding: '9px 18px', borderRadius: 8, border: `1px solid ${colors.borderStrong}`, fontSize: 13, color: colors.mutedStrong }}
            >
              Schülerdaten verwalten
            </button>
          )}
        </div>
      )}
    </div>
  );
}
