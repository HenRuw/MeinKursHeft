import { useState } from 'react';
import { colors, fonts } from '../theme.js';
import { sortStudents, studentDisplayName } from '../lib/gradeMath.js';

const label = { font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em', display: 'block', marginBottom: 5 };
const field = { padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, width: '100%' };
const select = { padding: '7px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, background: '#fff' };

function sortedFiltered(students, sortBy, filterKlasseId, filterJahrgang) {
  const byName = sortStudents(students);
  const withJahrgangTiebreak = (a, b) => {
    const ia = byName.indexOf(a);
    const ib = byName.indexOf(b);
    return ia - ib;
  };
  let sorted = byName;
  if (sortBy === 'jahrgang-asc' || sortBy === 'jahrgang-desc') {
    const dir = sortBy === 'jahrgang-asc' ? 1 : -1;
    sorted = [...byName].sort((a, b) => {
      const ja = a.klasse_jahrgang ?? -Infinity;
      const jb = b.klasse_jahrgang ?? -Infinity;
      return (ja - jb) * dir || withJahrgangTiebreak(a, b);
    });
  }
  return sorted.filter((s) => {
    if (filterKlasseId && String(s.klasse_id) !== String(filterKlasseId)) return false;
    if (filterJahrgang && String(s.klasse_jahrgang) !== String(filterJahrgang)) return false;
    return true;
  });
}

// Full-screen course creator/editor: same layout for both — a name (and, in
// edit mode, delete) at the top, and the whole-school student roster below
// with sort/filter/select-all to build the course's enrollment. Opens for
// both "Kurs anlegen" and the sidebar's per-course edit icon, per how the
// teacher actually works: naming a course and picking its roster are one
// task, not two separate menus.
export default function KursEditor({ mode, course, allStudents, klassen, initialSelectedIds, onSubmit, onDelete, onCancel }) {
  const [name, setName] = useState(course?.name || '');
  const [selectedIds, setSelectedIds] = useState(new Set(initialSelectedIds));
  const [sortBy, setSortBy] = useState('name');
  const [filterKlasseId, setFilterKlasseId] = useState('');
  const [filterJahrgang, setFilterJahrgang] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const jahrgaenge = [...new Set(klassen.map((k) => k.jahrgang))].sort((a, b) => a - b);
  const visible = sortedFiltered(allStudents, sortBy, filterKlasseId, filterJahrgang);
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selectedIds.has(s.id));

  const toggleStudent = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((s) => next.delete(s.id));
      else visible.forEach((s) => next.add(s.id));
      return next;
    });

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
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={field} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={label}>SORTIEREN</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={select}>
            <option value="name">Name (A–Z)</option>
            <option value="jahrgang-asc">Jahrgang aufsteigend</option>
            <option value="jahrgang-desc">Jahrgang absteigend</option>
          </select>
        </div>
        <div>
          <label style={label}>KLASSE</label>
          <select value={filterKlasseId} onChange={(e) => setFilterKlasseId(e.target.value)} style={select}>
            <option value="">Alle Klassen</option>
            {klassen.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={label}>JAHRGANG</label>
          <select value={filterJahrgang} onChange={(e) => setFilterJahrgang(e.target.value)} style={select}>
            <option value="">Alle Jahrgänge</option>
            {jahrgaenge.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>
        <button onClick={toggleSelectAllVisible} style={{ padding: '7px 13px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, fontSize: 12.5, fontWeight: 500, color: colors.mutedStrong }}>
          {allVisibleSelected ? 'Auswahl aufheben' : 'Alle auswählen'}
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: colors.mutedStrong }}>{selectedIds.size} ausgewählt</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: `1px solid ${colors.borderCard}`, borderRadius: 11, background: colors.cardBg }}>
        {visible.map((s) => (
          <label
            key={s.id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: `1px solid ${colors.divider}`, fontSize: 13, cursor: 'pointer' }}
          >
            <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleStudent(s.id)} />
            <span style={{ fontWeight: 500 }}>{studentDisplayName(s)}</span>
            <span style={{ fontSize: 11.5, color: colors.muted }}>{s.klasse_name ? `${s.klasse_name} · Jg. ${s.klasse_jahrgang}` : '–'}</span>
            <span style={{ flex: 1 }} />
          </label>
        ))}
        {!visible.length && <div style={{ padding: '10px 14px', fontSize: 12.5, color: colors.mutedStrong }}>Keine Schüler:innen gefunden.</div>}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={submit} style={{ padding: '9px 18px', borderRadius: 8, background: colors.teal, color: '#fff', fontSize: 13, fontWeight: 500 }}>
          {mode === 'create' ? 'Anlegen' : 'Speichern'}
        </button>
        <button onClick={onCancel} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${colors.borderStrong}`, fontSize: 13 }}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}
