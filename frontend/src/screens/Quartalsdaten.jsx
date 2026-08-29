import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';

const th = { font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' };
const field = { padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, width: 140 };

// Quarter date ranges apply to every course at once (they're set once for
// the whole school year), so this screen isn't scoped to the currently
// selected course — it reads/writes the same idx across all courses' own
// quarter rows to keep them in sync.
export default function Quartalsdaten({ courses }) {
  const [quarters, setQuarters] = useState(null);

  const load = async () => {
    if (!courses.length) {
      setQuarters([]);
      return;
    }
    const bundle = await api.getCourseBundle(courses[0].id);
    setQuarters([...bundle.quarters].sort((a, b) => a.idx - b.idx));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses.length]);

  const saveDate = async (idx, patch) => {
    const bundles = await Promise.all(courses.map((c) => api.getCourseBundle(c.id)));
    for (const b of bundles) {
      const q = b.quarters.find((q) => q.idx === idx);
      if (q) await api.updateQuarter(q.id, patch);
    }
    await load();
  };

  if (quarters === null) return null;

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
      <div style={{ font: `500 20px/1.2 ${fonts.serif}`, marginBottom: 18 }}>Quartalsdaten</div>

      {!courses.length ? (
        <div style={{ fontSize: 13, color: colors.mutedStrong }}>Lege zuerst einen Kurs an.</div>
      ) : (
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
                  <input type="date" defaultValue={q.start_date} onBlur={(e) => saveDate(q.idx, { startDate: e.target.value })} style={field} />
                </td>
                <td style={{ padding: '4px 10px' }}>
                  <input type="date" defaultValue={q.end_date} onBlur={(e) => saveDate(q.idx, { endDate: e.target.value })} style={field} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
