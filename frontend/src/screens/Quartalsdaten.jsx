import { colors, fonts } from '../theme.js';
import QuartalEditor from '../components/QuartalEditor.jsx';

// Quarter date ranges belong to the school year (the single source of truth),
// not to any one course -- every course in the year shares this calendar. The
// editing/creation UI lives in the reusable QuartalEditor (also shown in the
// Notenübersicht when a year has no quarters yet).
export default function Quartalsdaten({ yearId, yearLabel, archived }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
      <div style={{ font: `500 20px/1.2 ${fonts.serif}`, marginBottom: 6 }}>Quartalsdaten</div>
      <div style={{ fontSize: 12.5, color: colors.mutedStrong, marginBottom: 18 }}>
        Gelten für alle Kurse dieses Schuljahres. Die Gewichtungen bleiben pro Kurs (in der Notenübersicht).
      </div>
      <QuartalEditor yearId={yearId} yearLabel={yearLabel} archived={archived} />
    </div>
  );
}
