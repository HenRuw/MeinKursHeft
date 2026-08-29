import { useState } from 'react';
import { colors } from '../theme.js';
import { sortStudents, studentDisplayName } from '../lib/gradeMath.js';

// Checkbox list of all students, used both when creating a course and when
// editing an existing course's roster via the sidebar's edit menu.
export default function StudentPicker({ students, selectedIds, onToggle }) {
  const [query, setQuery] = useState('');

  const sorted = sortStudents(students);
  const q = query.trim().toLowerCase();
  const filtered = q ? sorted.filter((s) => studentDisplayName(s).toLowerCase().includes(q)) : sorted;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        placeholder="Suchen …"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ padding: '7px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12.5 }}
      />
      <div style={{ maxHeight: 260, overflow: 'auto', border: `1px solid ${colors.divider}`, borderRadius: 8 }}>
        {filtered.map((s) => (
          <label
            key={s.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: 12.5, borderTop: `1px solid ${colors.divider}`, cursor: 'pointer' }}
          >
            <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => onToggle(s.id)} />
            <span>{studentDisplayName(s)}</span>
          </label>
        ))}
        {!filtered.length && (
          <div style={{ padding: '9px 10px', fontSize: 12, color: colors.mutedStrong }}>
            {students.length ? 'Keine Treffer.' : 'Noch keine Schüler:innen angelegt.'}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: colors.mutedStrong }}>{selectedIds.size} ausgewählt</div>
    </div>
  );
}
