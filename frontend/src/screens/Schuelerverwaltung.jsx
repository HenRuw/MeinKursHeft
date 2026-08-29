import { useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';
import { sortStudents, studentDisplayName } from '../lib/gradeMath.js';

const th = { font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em', textAlign: 'left', padding: '8px 12px' };
const td = { padding: '9px 12px', borderTop: `1px solid ${colors.divider}`, fontSize: 13 };

export default function Schuelerverwaltung({ allStudents, onRefreshAllStudents, bundle, onRefreshBundle }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [enrollPick, setEnrollPick] = useState('');

  const sorted = sortStudents(allStudents);
  const enrolledIds = new Set((bundle?.students || []).map((s) => s.id));
  const notEnrolled = sorted.filter((s) => !enrolledIds.has(s.id));

  const addStudent = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    await api.createStudent({ firstName: firstName.trim(), lastName: lastName.trim() });
    setFirstName('');
    setLastName('');
    onRefreshAllStudents();
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditFirst(s.first_name);
    setEditLast(s.last_name);
  };

  const saveEdit = async () => {
    await api.updateStudent(editingId, { firstName: editFirst.trim(), lastName: editLast.trim() });
    setEditingId(null);
    onRefreshAllStudents();
  };

  const removeStudent = async (id) => {
    await api.deleteStudent(id);
    onRefreshAllStudents();
    if (bundle) onRefreshBundle();
  };

  const enroll = async () => {
    if (!bundle || !enrollPick) return;
    await api.enrollStudent(bundle.course.id, Number(enrollPick));
    setEnrollPick('');
    onRefreshBundle();
  };

  const unenroll = async (studentId) => {
    if (!bundle) return;
    await api.unenrollStudent(bundle.course.id, studentId);
    onRefreshBundle();
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24, display: 'flex', gap: 24 }}>
      <section style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `500 24px/1.1 ${fonts.serif}`, marginBottom: 16 }}>Schülerverwaltung</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input placeholder="Vorname" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <input placeholder="Nachname" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }} />
          <button onClick={addStudent} style={{ padding: '8px 15px', borderRadius: 7, background: colors.teal, color: '#fff', fontSize: 12.5, fontWeight: 500 }}>
            Hinzufügen
          </button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: colors.cardBg, border: `1px solid ${colors.borderCard}`, borderRadius: 11, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#faf8f4' }}>
              <th style={th}>NACHNAME, VORNAME</th>
              <th style={{ ...th, width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.id}>
                {editingId === s.id ? (
                  <td style={td} colSpan={2}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={editLast} onChange={(e) => setEditLast(e.target.value)} style={{ flex: 1, padding: '6px 8px', border: `1px solid ${colors.borderStrong}`, borderRadius: 6, fontSize: 12.5 }} />
                      <input value={editFirst} onChange={(e) => setEditFirst(e.target.value)} style={{ flex: 1, padding: '6px 8px', border: `1px solid ${colors.borderStrong}`, borderRadius: 6, fontSize: 12.5 }} />
                      <button onClick={saveEdit} style={{ padding: '6px 12px', borderRadius: 6, background: colors.teal, color: '#fff', fontSize: 12 }}>
                        Speichern
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${colors.borderStrong}`, fontSize: 12 }}>
                        Abbrechen
                      </button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td style={{ ...td, fontWeight: 500 }}>{studentDisplayName(s)}</td>
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
                <td style={td} colSpan={2}>
                  Noch keine Schüler:innen angelegt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {bundle && (
        <section style={{ width: 340, flex: 'none' }}>
          <div style={{ font: `500 16px/1.2 ${fonts.serif}`, marginBottom: 16 }}>Eingeschrieben in {bundle.course.name}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <select value={enrollPick} onChange={(e) => setEnrollPick(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }}>
              <option value="">Schüler:in wählen …</option>
              {notEnrolled.map((s) => (
                <option key={s.id} value={s.id}>
                  {studentDisplayName(s)}
                </option>
              ))}
            </select>
            <button onClick={enroll} disabled={!enrollPick} style={{ padding: '8px 15px', borderRadius: 7, background: enrollPick ? colors.teal : colors.divider, color: enrollPick ? '#fff' : colors.faint, fontSize: 12.5, fontWeight: 500 }}>
              Einschreiben
            </button>
          </div>
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.borderCard}`, borderRadius: 11, overflow: 'hidden' }}>
            {sortStudents(bundle.students).map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderTop: `1px solid ${colors.divider}`, fontSize: 13 }}>
                <span>{studentDisplayName(s)}</span>
                <button onClick={() => unenroll(s.id)} style={{ fontSize: 12, color: colors.red }}>
                  Entfernen
                </button>
              </div>
            ))}
            {!bundle.students.length && (
              <div style={{ padding: '9px 12px', fontSize: 12.5, color: colors.mutedStrong }}>Noch niemand eingeschrieben.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
