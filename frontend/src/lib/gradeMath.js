// Grade-scale helpers shared by every screen. Grades are German 1-6 school
// grades with an optional tendency, stored as strings like "2", "2+", "2-".

export const GRADE_DIGITS = ['1', '2', '3', '4', '5', '6'];
export const TENDENCIES = ['+', '-'];

const TENDENCY_OFFSET = { '+': -0.3, '-': 0.3 };

// "2+" -> 1.7, "2-" -> 2.3, "3" -> 3, null/"" -> null
export function num(grade) {
  if (!grade) return null;
  const base = Number(grade[0]);
  const tendency = grade[1];
  return base + (TENDENCY_OFFSET[tendency] || 0);
}

// 2.3 -> "2,3", null -> "–"
export function fmt(value) {
  if (value == null || Number.isNaN(value)) return '–';
  return value.toFixed(1).replace('.', ',');
}

const GRADE_COLOR_STOPS = [
  { at: 1, rgb: [15, 107, 61] }, // dark green
  { at: 3, rgb: [216, 160, 42] }, // gold/yellow
  { at: 6, rgb: [139, 32, 32] }, // dark red
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Continuous gradient: dark green at 1(+) -> yellow at 3 -> dark red at 6(-).
export function gradeColor(value) {
  if (value == null || Number.isNaN(value)) return '#8b968f';
  const v = Math.max(1, Math.min(6, value));
  const [lo, hi] = v <= 3 ? [GRADE_COLOR_STOPS[0], GRADE_COLOR_STOPS[1]] : [GRADE_COLOR_STOPS[1], GRADE_COLOR_STOPS[2]];
  const t = (v - lo.at) / (hi.at - lo.at);
  const rgb = lo.rgb.map((c, i) => Math.round(lerp(c, hi.rgb[i], t)));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

// Weighted average of [value, weight] pairs. Skips null values and
// non-positive weights. Returns null if nothing is left to average.
export function wavg(pairs) {
  const usable = pairs.filter((p) => p[0] != null && p[1] > 0);
  if (!usable.length) return null;
  const weightSum = usable.reduce((a, p) => a + p[1], 0);
  return usable.reduce((a, p) => a + p[0] * p[1], 0) / weightSum;
}

// Parses a weight input's text value (German comma decimals allowed),
// falling back to 0 (excluded from the average) for invalid input.
export function parseWeight(raw) {
  const v = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function formatWeight(value) {
  return String(value).replace('.', ',');
}

export function studentDisplayName(student) {
  return `${student.last_name}, ${student.first_name}`;
}

export function studentKlasseLabel(student) {
  return student.klasse_name || null;
}

export function sortStudents(students) {
  return [...students].sort(
    (a, b) => a.last_name.localeCompare(b.last_name, 'de') || a.first_name.localeCompare(b.first_name, 'de')
  );
}

const WRITTEN_WORK_KINDS = [
  { value: 'klassenarbeit', label: 'Klassenarbeit' },
  { value: 'test', label: 'Test' },
  { value: 'sonstige', label: 'Sonstige Leistungen' },
];

export function writtenWorkKindLabel(kind) {
  return WRITTEN_WORK_KINDS.find((k) => k.value === kind)?.label || kind;
}

export { WRITTEN_WORK_KINDS };

// Only Klassenarbeiten count as "schriftlich" — Tests and Sonstige Leistungen
// are graded work but count toward Mitarbeit, alongside lesson grades.
export const WRITTEN_WORK_GROUP = {
  klassenarbeit: 'schriftlich',
  test: 'mitarbeit',
  sonstige: 'mitarbeit',
};

// Mitarbeit average: lesson grades (each weighted 1, i.e. a plain mean among
// themselves) combined with any Test/Sonstige grades at their own weight.
export function mitarbeitAverage(studentId, lessons, works) {
  const pairs = [
    ...lessons.map((l) => [num(l.grades.find((g) => g.student_id === studentId)?.grade), l.weight]),
    ...works.filter((w) => WRITTEN_WORK_GROUP[w.kind] === 'mitarbeit').map((w) => [num(w.grades.find((g) => g.student_id === studentId)?.grade), w.weight]),
  ];
  return wavg(pairs);
}

// Schriftlich average: Klassenarbeiten only, weighted.
export function schriftlichAverage(studentId, works) {
  return wavg(
    works.filter((w) => WRITTEN_WORK_GROUP[w.kind] === 'schriftlich').map((w) => [num(w.grades.find((g) => g.student_id === studentId)?.grade), w.weight])
  );
}

// A manually-entered average stands in for its calculated counterpart
// everywhere that average is shown — this is the single lookup both the
// course-wide Notenübersicht and the embedded per-student one (Schueler-
// ansicht reuses the same component) go through, so they can never disagree
// about which averages are overridden.
export function findOverride(overrides, studentId, kind, refId) {
  return overrides.find((o) => o.student_id === studentId && o.kind === kind && o.ref_id === refId) || null;
}

// Resolves an average to its override when one exists, else the calculated
// value — call sites feed the resolved `value` into anything computed from
// it (Q-Note from Ø MIT./Ø SCHR., etc.) so an override cascades upward.
export function resolveAverage(overrides, studentId, kind, refId, calculated) {
  const override = findOverride(overrides, studentId, kind, refId);
  return override ? { value: num(override.grade), overridden: true, grade: override.grade } : { value: calculated, overridden: false, grade: null };
}

// Inserts exactly one line break near the middle of a label, at the nearest
// word boundary, so column headers wrap to exactly two lines.
export function wrapLabel(label) {
  if (label.length <= 10 || !label.includes(' ')) return label;
  const mid = label.length / 2;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === ' ') {
      const dist = Math.abs(i - mid);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
  }
  if (bestIdx === -1) return label;
  return `${label.slice(0, bestIdx)}\n${label.slice(bestIdx + 1)}`;
}

// Font-size/weight scale for grade values in the Notenübersicht (requirement:
// 2 size points difference between "small" and "large").
export const GRADE_TYPE_SCALE = {
  single: { fontSize: 11, fontWeight: 500 }, // individual lesson/exam grades
  average: { fontSize: 13, fontWeight: 500 }, // Ø Mitarbeit / Ø Schriftlich
  summary: { fontSize: 13, fontWeight: 700 }, // Q-Note / HJ-Note / Zeugnis
};
