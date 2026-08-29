import { useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';

const label = { font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em', display: 'block', marginBottom: 5 };
const field = { padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, width: '100%' };
const row = { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14, maxWidth: 340 };

export default function Einstellungen({ bundle, onRefresh }) {
  const [name, setName] = useState(bundle?.course.name || '');
  const [hours, setHours] = useState(String(bundle?.course.hours_per_week ?? ''));
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!bundle) return null;
  const { course, quarters } = bundle;

  const save = async () => {
    await api.updateCourse(course.id, { name: name.trim(), hoursPerWeek: parseFloat(hours.replace(',', '.')) || 1 });
    onRefresh();
  };

  const saveQuarter = async (q, patch) => {
    await api.updateQuarter(q.id, patch);
    onRefresh();
  };

  const deleteCourse = async () => {
    await api.deleteCourse(course.id);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
      <div style={{ font: `500 20px/1.2 ${fonts.serif}`, marginBottom: 18 }}>Gewichtung &amp; Einstellungen</div>

      <div style={row}>
        <label style={label}>KURSNAME</label>
        <input style={field} value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />
      </div>
      <div style={row}>
        <label style={label}>STUNDEN / WOCHE</label>
        <input style={field} value={hours} onChange={(e) => setHours(e.target.value)} onBlur={save} />
      </div>

      <div style={{ font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em', margin: '22px 0 10px' }}>
        QUARTALE
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            {['Quartal', 'Von', 'Bis', 'Gew. Mitarbeit', 'Gew. Schriftlich', 'Gew. Quartal'].map((h) => (
              <th key={h} style={{ ...label, padding: '4px 10px', textAlign: 'left' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {quarters.map((q) => (
            <tr key={q.id}>
              <td style={{ padding: '4px 10px', fontWeight: 600 }}>{q.idx}. Quartal</td>
              <td style={{ padding: '4px 10px' }}>
                <input type="date" defaultValue={q.start_date} onBlur={(e) => saveQuarter(q, { startDate: e.target.value })} style={{ ...field, width: 140 }} />
              </td>
              <td style={{ padding: '4px 10px' }}>
                <input type="date" defaultValue={q.end_date} onBlur={(e) => saveQuarter(q, { endDate: e.target.value })} style={{ ...field, width: 140 }} />
              </td>
              <td style={{ padding: '4px 10px' }}>
                <input defaultValue={q.weight_mitarbeit} onBlur={(e) => saveQuarter(q, { weightMitarbeit: parseFloat(e.target.value.replace(',', '.')) || 1 })} style={{ ...field, width: 60 }} />
              </td>
              <td style={{ padding: '4px 10px' }}>
                <input defaultValue={q.weight_schriftlich} onBlur={(e) => saveQuarter(q, { weightSchriftlich: parseFloat(e.target.value.replace(',', '.')) || 1 })} style={{ ...field, width: 60 }} />
              </td>
              <td style={{ padding: '4px 10px' }}>
                <input defaultValue={q.weight_quarter} onBlur={(e) => saveQuarter(q, { weightQuarter: parseFloat(e.target.value.replace(',', '.')) || 1 })} style={{ ...field, width: 60 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 28 }}>
        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12.5, color: colors.red }}>Kurs inkl. aller Daten wirklich löschen?</span>
            <button onClick={deleteCourse} style={{ padding: '8px 14px', borderRadius: 7, background: colors.red, color: '#fff', fontSize: 12.5, fontWeight: 500 }}>
              Ja, löschen
            </button>
            <button onClick={() => setConfirmDelete(false)} style={{ padding: '8px 14px', borderRadius: 7, border: `1px solid ${colors.borderStrong}`, fontSize: 12.5 }}>
              Abbrechen
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ padding: '8px 14px', borderRadius: 7, border: `1px solid ${colors.redBorder}`, color: colors.red, background: colors.redBg, fontSize: 12.5, fontWeight: 500 }}>
            Kurs löschen
          </button>
        )}
      </div>
    </div>
  );
}
