import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { colors, fonts } from '../theme.js';

const th = { font: `500 9.5px ${fonts.mono}`, color: colors.muted, letterSpacing: '.09em' };
const field = { padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, width: 140 };
const primaryBtn = { padding: '9px 15px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: 'none', background: colors.teal, color: '#fff' };

// Standard four-quarter school year (Aug–Jul) derived from the year label, so a
// year created without a quarter calendar (e.g. rollover without "copyQuarters")
// gets sensible, year-appropriate default dates that stay fully editable.
function defaultRangesForYear(label) {
  const m = String(label ?? '').match(/\d+/);
  let sy = m ? parseInt(m[0], 10) : new Date().getFullYear();
  if (sy < 100) sy += 2000;
  const ny = sy + 1;
  return [
    [`${sy}-08-01`, `${sy}-11-15`],
    [`${sy}-11-16`, `${ny}-01-31`],
    [`${ny}-02-01`, `${ny}-04-15`],
    [`${ny}-04-16`, `${ny}-07-31`],
  ];
}

// The year's quarter calendar (single source of truth for quarter dates — shared
// by every course in the year). Reusable across the Verwaltung screen and the
// Notenübersicht's "create your quarters first" hint. Reports back through
// onChanged so the embedding screen can refresh whatever depends on it.
export default function QuartalEditor({ yearId, yearLabel, archived, onChanged }) {
  const [quarters, setQuarters] = useState(null);
  const [busy, setBusy] = useState(false);

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
    onChanged?.();
  };

  const createDefaults = async () => {
    setBusy(true);
    try {
      const ranges = defaultRangesForYear(yearLabel).map(([startDate, endDate], i) => ({ idx: i + 1, startDate, endDate }));
      await api.setYearQuarters(yearId, ranges);
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (quarters === null) return null;
  if (yearId == null) return <div style={{ fontSize: 13, color: colors.mutedStrong }}>Kein Schuljahr ausgewählt.</div>;

  if (!quarters.length) {
    return (
      <button onClick={createDefaults} disabled={archived || busy} style={{ ...primaryBtn, opacity: archived || busy ? 0.6 : 1 }}>
        {busy ? 'Lege an …' : 'Quartale anlegen'}
      </button>
    );
  }

  return (
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
  );
}
