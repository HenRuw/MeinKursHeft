import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';

const th = { font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' };
const field = { padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, width: 140 };

// Quarter date ranges belong to the school year (the single source of truth),
// not to any one course -- every course in the year shares this calendar. So
// this screen reads/writes the year's quarter calendar directly.
export default function Quartalsdaten({ yearId, archived }) {
  const [quarters, setQuarters] = useState(null);

  const load = async () => {
    if (yearId == null) {
      setQuarters([]);
      return;
    }
    const rows = await api.getYearQuarters(yearId);
    setQuarters([...rows].sort((a, b) => a.idx - b.idx));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  const saveDate = async (idx, patch) => {
    await api.setYearQuarters(yearId, [{ idx, ...patch }]);
    await load();
  };

  if (quarters === null) return null;

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
      <div style={{ font: `500 20px/1.2 ${fonts.serif}`, marginBottom: 6 }}>Quartalsdaten</div>
      <div style={{ fontSize: 12.5, color: colors.mutedStrong, marginBottom: 18 }}>
        Gelten für alle Kurse dieses Schuljahres. Die Gewichtungen bleiben pro Kurs (in der Notenübersicht).
      </div>

      {!quarters.length ? (
        <div style={{ fontSize: 13, color: colors.mutedStrong }}>Kein Schuljahr ausgewählt.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              {['Quartal', 'Von', 'Bis'].map((h) => (
                <th key={h} style={{ ...th, padding: '4px 10px', textAlign: 'left' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quarters.map((q) => (
              <tr key={q.idx}>
                <td style={{ padding: '4px 10px', fontWeight: 600 }}>{q.idx}. Quartal</td>
                <td style={{ padding: '4px 10px' }}>
                  <input type="date" disabled={archived} defaultValue={q.start_date} onBlur={(e) => saveDate(q.idx, { startDate: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} style={{ ...field, opacity: archived ? 0.55 : 1 }} />
                </td>
                <td style={{ padding: '4px 10px' }}>
                  <input type="date" disabled={archived} defaultValue={q.end_date} onBlur={(e) => saveDate(q.idx, { endDate: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} style={{ ...field, opacity: archived ? 0.55 : 1 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
