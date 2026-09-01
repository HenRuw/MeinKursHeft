const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { AsyncLocalStorage } = require('async_hooks');
const initSqlJs = require('sql.js');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'meinkursheft.sqlite');

// The primary account keeps the original, suffix-less database filename so
// existing setups, scripts and backups are unaffected. Additional accounts get
// their own on-disk database whose data is completely independent — see
// deriveAccountPath below.
const DEFAULT_ACCOUNT_ID = '1';

// Feature branches get their own on-disk database, so schema experiments on
// one branch (e.g. an ALTER TABLE that isn't a clean no-op on `main`) can
// never bleed into another branch's local dev data. `main`/`master` keep the
// original, suffix-less filename so existing setups/scripts are unaffected;
// git failures (no repo, detached worktree, git not installed) fall back to
// that same default rather than breaking startup.
function defaultDbPathForBranch() {
  let branch;
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return DEFAULT_DB_PATH;
  }
  if (!branch || branch === 'main' || branch === 'master' || branch === 'HEAD') return DEFAULT_DB_PATH;
  const slug = branch.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return path.join(__dirname, '..', 'data', `meinkursheft.${slug}.sqlite`);
}

// Turns the primary account's database path into a per-account one by inserting
// a `.user<id>` marker right after the leading `meinkursheft` token, so account 2
// lives in its own file next to account 1's:
//   data/meinkursheft.sqlite        -> data/meinkursheft.user2.sqlite
//   data/meinkursheft.<branch>.sqlite -> data/meinkursheft.user2.<branch>.sqlite
// The primary account (id '1') is returned unchanged, so its file, all scripts
// and every existing backup keep working exactly as before. Deriving from the
// resolved base path (rather than recomputing) means a DB_PATH override for
// testing keeps the second account's file right alongside the first.
function deriveAccountPath(basePath, accountId) {
  if (accountId === DEFAULT_ACCOUNT_ID) return basePath;
  if (basePath === ':memory:') return ':memory:';
  const dir = path.dirname(basePath);
  const base = path.basename(basePath);
  const dot = base.indexOf('.');
  const head = dot < 0 ? base : base.slice(0, dot);
  const tail = dot < 0 ? '' : base.slice(dot);
  return path.join(dir, `${head}.user${accountId}${tail}`);
}

const DEFAULT_PRESETS = [
  { emoji: '🗣️', text: 'Stört den Unterricht' },
  { emoji: '📕', text: 'Material vergessen' },
  { emoji: '📝', text: 'Hausaufgaben fehlen' },
];

const DEFAULT_QUARTER_RANGES = [
  ['2026-08-01', '2026-11-15'],
  ['2026-11-16', '2027-01-31'],
  ['2027-02-01', '2027-04-15'],
  ['2027-04-16', '2027-07-31'],
];

let SQL = null;

// One open database per account, keyed by account id: { db, dbPath }. Every
// data function below reaches its database through requireDb()/persist(), which
// resolve the *current* account from the async-local context set per request
// (see runWithAccount + the account middleware in server.js). Outside any
// request — direct db.* calls in scripts and tests — the context is empty and
// the primary account ('1') is used, so all existing call sites behave exactly
// as before.
const accounts = new Map();
const accountContext = new AsyncLocalStorage();

function currentAccountId() {
  const store = accountContext.getStore();
  return (store && store.accountId) || DEFAULT_ACCOUNT_ID;
}

// Runs fn with the given account as the active one. `next()` (and the whole
// synchronous request handler chain, including notify) therefore sees the right
// database. Falls back to the primary account for a missing/blank id.
function runWithAccount(accountId, fn) {
  return accountContext.run({ accountId: accountId || DEFAULT_ACCOUNT_ID }, fn);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS klassen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  jahrgang INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  klasse_id INTEGER REFERENCES klassen(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  hours_per_week REAL NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS course_students (
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, student_id)
);

CREATE TABLE IF NOT EXISTS halves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  weight REAL NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS quarters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  half_id INTEGER NOT NULL REFERENCES halves(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  weight_mitarbeit REAL NOT NULL DEFAULT 1,
  weight_schriftlich REAL NOT NULL DEFAULT 1,
  weight_quarter REAL NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  quarter_id INTEGER NOT NULL REFERENCES quarters(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  end_date TEXT,
  duration_hours REAL NOT NULL DEFAULT 1,
  topic TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  weight REAL NOT NULL DEFAULT 1,
  grades_locked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attendance (
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'anwesend' CHECK(status IN ('anwesend','verspaetet','fehlt')),
  late_minutes INTEGER,
  excused INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (lesson_id, student_id)
);

CREATE TABLE IF NOT EXISTS participation_grades (
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  grade TEXT,
  PRIMARY KEY (lesson_id, student_id)
);

CREATE TABLE IF NOT EXISTS written_works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  quarter_id INTEGER NOT NULL REFERENCES quarters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('klassenarbeit','test','sonstige')),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  grades_locked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS written_work_grades (
  written_work_id INTEGER NOT NULL REFERENCES written_works(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  grade TEXT,
  PRIMARY KEY (written_work_id, student_id)
);

CREATE TABLE IF NOT EXISTS remarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK(target_type IN ('lesson','written_work')),
  target_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS remark_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emoji TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL
);

-- A manually-entered average that stands in for a computed one (Ø MIT./
-- Ø SCHR./Q-Note/HJ-Note/Zeugnis) everywhere it's displayed. ref_id scopes
-- it to the right thing per kind: a quarter for mitAvg/schrAvg/qNote, a half
-- for hjNote, and the course itself for zeugnis (there's no smaller unit to
-- scope a year grade to, and a NULL there would defeat the UNIQUE index —
-- SQL treats every NULL as distinct from every other NULL).
CREATE TABLE IF NOT EXISTS grade_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('mitAvg','schrAvg','qNote','hjNote','zeugnis')),
  ref_id INTEGER NOT NULL,
  grade TEXT NOT NULL,
  UNIQUE(course_id, student_id, kind, ref_id)
);

-- Locks a single average cell (Ø Mitarbeit/Ø Klassenarbeiten/Q-Note/HJ-Note/
-- Zeugnis) against editing. Keyed exactly like grade_overrides -- the mere
-- presence of a row means "locked" -- so an average can be frozen whether or
-- not it currently carries a manual override.
CREATE TABLE IF NOT EXISTS average_locks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('mitAvg','schrAvg','qNote','hjNote','zeugnis')),
  ref_id INTEGER NOT NULL,
  UNIQUE(course_id, student_id, kind, ref_id)
);

-- Small key/value store for one-time data migrations (see the lesson-weight
-- backfill in init) so they don't re-run on every startup.
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ---- Schuljahre (school years) ----
-- Everything a teacher works with lives inside one school year. Courses,
-- classes, per-year student memberships and the quarter calendar all hang off
-- a school_years row. Archiving a year makes it read-only (export only);
-- hard-deleting one cascades to its courses (and, through those, lessons and
-- grades) plus its classes/memberships/quarter calendar.
CREATE TABLE IF NOT EXISTS school_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0
);

-- The single source of truth for quarter DATE ranges, one row per (year, idx).
-- Per-course quarters keep only their weights; their own start/end columns are
-- vestigial and always overlaid with these dates on read (see getCourseBundle).
CREATE TABLE IF NOT EXISTS year_quarters (
  year_id INTEGER NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  PRIMARY KEY (year_id, idx)
);

-- A named class within a year (e.g. "10b" in 2026/27). A year-scoped entity so
-- it can be renamed for everyone at once and advanced at the year rollover.
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year_id INTEGER NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(year_id, name)
);

-- A student's membership in one year, with an optional class. class_id NULL
-- means "in the year, but Ohne Klasse". One row per (student, year): a student
-- is in at most one class per year. Removing a student "from this year" just
-- deletes this row -- the person survives in the pool and in other years.
CREATE TABLE IF NOT EXISTS student_year (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  year_id INTEGER NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  PRIMARY KEY (student_id, year_id)
);
`;

// Creates the schema and runs the idempotent migrations/seed on the *current*
// account's database. Every statement is guarded (CREATE TABLE IF NOT EXISTS,
// column-existence checks, app_meta flags), so running this against an already
// up-to-date database — e.g. the live account-1 file on every startup — is a
// harmless no-op that never rewrites or drops existing data.
function applySchema() {
  // Pass no params here so sql.js takes the multi-statement exec path; calling
  // run(sql, []) would use prepare(), which only executes the first statement.
  const database = requireDb();
  database.run('PRAGMA foreign_keys = ON');
  database.run(SCHEMA);

  // `students` may already exist from before klasse_id was introduced —
  // CREATE TABLE IF NOT EXISTS above is a no-op for it, so add the column
  // by hand for databases that predate this change.
  const studentColumns = all('PRAGMA table_info(students)').map((c) => c.name);
  if (!studentColumns.includes('klasse_id')) {
    run('ALTER TABLE students ADD COLUMN klasse_id INTEGER REFERENCES klassen(id) ON DELETE SET NULL');
  }

  // `lessons` may already exist from before per-lesson weighting was
  // introduced — CREATE TABLE IF NOT EXISTS above is a no-op for it, so add
  // the column by hand for databases that predate this change.
  const lessonColumns = all('PRAGMA table_info(lessons)').map((c) => c.name);
  if (!lessonColumns.includes('weight')) {
    run('ALTER TABLE lessons ADD COLUMN weight REAL NOT NULL DEFAULT 1');
  }

  // Whole-grade-set lock columns, added by hand for databases that predate
  // the "lock a Notensatz against editing" feature (CREATE TABLE IF NOT
  // EXISTS above is a no-op once a table already exists).
  if (!lessonColumns.includes('grades_locked')) {
    run('ALTER TABLE lessons ADD COLUMN grades_locked INTEGER NOT NULL DEFAULT 0');
  }
  // end_date backs a multi-Schulstunden unit's "von … bis" span; a single-
  // hour lesson leaves it equal to date. Nullable, so pre-existing rows read
  // back as null and are treated as single-day by callers (end_date ?? date).
  if (!lessonColumns.includes('end_date')) {
    run('ALTER TABLE lessons ADD COLUMN end_date TEXT');
    run('UPDATE lessons SET end_date = date WHERE end_date IS NULL');
  }
  const workColumns = all('PRAGMA table_info(written_works)').map((c) => c.name);
  if (!workColumns.includes('grades_locked')) {
    run('ALTER TABLE written_works ADD COLUMN grades_locked INTEGER NOT NULL DEFAULT 0');
  }

  // Courses gained a school year. Added by hand (nullable -- SQLite can't add a
  // NOT NULL column without a constant default) for databases that predate the
  // Schuljahre feature; the years_v1 migration below backfills it.
  const courseColumns = all('PRAGMA table_info(courses)').map((c) => c.name);
  if (!courseColumns.includes('year_id')) {
    run('ALTER TABLE courses ADD COLUMN year_id INTEGER REFERENCES school_years(id) ON DELETE CASCADE');
  }

  // A lesson's Gewichtung defaults to its Schulstunden count. Older lessons
  // created while the weight was hardcoded to 1 can still be off, so bring
  // every existing lesson's weight up to its duration once. Guarded by
  // app_meta so it never re-runs and clobbers a later manual override.
  if (!get('SELECT value FROM app_meta WHERE key = ?', ['lesson_weight_eq_hours'])) {
    run('UPDATE lessons SET weight = duration_hours');
    run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', ['lesson_weight_eq_hours', '1']);
  }

  if (!all('SELECT id FROM remark_presets').length) {
    DEFAULT_PRESETS.forEach((p) => run('INSERT INTO remark_presets (emoji, text) VALUES (?, ?)', [p.emoji, p.text]));
  }

  migrateToYearsV1();
}

// One-time, idempotent migration to the Schuljahre model (guarded by an
// app_meta flag so it never re-runs). Loss-free: it introduces a single start
// year "2026/27" and re-homes everything that exists today under it --
//   * every existing course           -> year_id = start year
//   * every klassen row                -> a classes row in the start year
//   * every student's klasse_id        -> a student_year row (class or Ohne Klasse)
//   * today's shared quarter date ranges -> the start year's quarter calendar
// Nothing is deleted or rewritten; students.klasse_id and the per-course
// quarter date columns are simply no longer the source of truth afterwards.
const YEARS_V1_LABEL = '2026/27';

function migrateToYearsV1() {
  if (get('SELECT value FROM app_meta WHERE key = ?', ['years_v1'])) return;
  // A DB that somehow already has a year (e.g. created fresh on this schema)
  // still gets flagged, so we never clobber an existing setup.
  let yearId = get('SELECT id FROM school_years ORDER BY sort_order ASC, id ASC LIMIT 1');
  if (!yearId) {
    run('INSERT INTO school_years (label, sort_order, archived) VALUES (?, 0, 0)', [YEARS_V1_LABEL]);
    yearId = lastId();
  } else {
    yearId = yearId.id;
  }

  // Every existing course joins the start year.
  run('UPDATE courses SET year_id = ? WHERE year_id IS NULL', [yearId]);

  // klassen -> classes (in the start year), keeping an old->new id map so
  // student memberships can point at the right class.
  const classIdByKlasse = new Map();
  for (const k of all('SELECT id, name FROM klassen ORDER BY id ASC')) {
    run('INSERT OR IGNORE INTO classes (year_id, name) VALUES (?, ?)', [yearId, k.name]);
    const row = get('SELECT id FROM classes WHERE year_id = ? AND name = ?', [yearId, k.name]);
    if (row) classIdByKlasse.set(k.id, row.id);
  }

  // Every student becomes a member of the start year; a valid klasse_id maps to
  // its class, anything else (null or a dangling id) lands as Ohne Klasse.
  for (const s of all('SELECT id, klasse_id FROM students ORDER BY id ASC')) {
    const classId = classIdByKlasse.has(s.klasse_id) ? classIdByKlasse.get(s.klasse_id) : null;
    run('INSERT OR IGNORE INTO student_year (student_id, year_id, class_id) VALUES (?, ?, ?)', [s.id, yearId, classId]);
  }

  // Seed the year's quarter calendar from today's shared ranges (the dates any
  // real course already uses), falling back to the hardcoded defaults.
  const ranges = referenceQuarterRanges(-1);
  ranges.forEach(([start, end], i) => {
    run('INSERT OR IGNORE INTO year_quarters (year_id, idx, start_date, end_date) VALUES (?, ?, ?, ?)', [yearId, i + 1, start, end]);
  });

  run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', ['ui_last_year_id', String(yearId)]);
  run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', ['years_v1', '1']);
}

// Opens (or creates) the database for one account and runs the schema/migrations
// within that account's context, so a brand-new account starts with a fully
// migrated, seeded, but otherwise empty database. Re-initialising an account
// closes its previous handle first, so repeated calls (e.g. per test) don't leak.
async function initAccount(accountId, basePath) {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  const id = accountId || DEFAULT_ACCOUNT_ID;
  const base = basePath || process.env.DB_PATH || defaultDbPathForBranch();
  const dbPath = deriveAccountPath(base, id);

  const existing = accounts.get(id);
  if (existing) {
    try { existing.db.close(); } catch { /* ignore */ }
  }

  let database;
  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    database = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    database = new SQL.Database();
  }
  accounts.set(id, { db: database, dbPath });

  // Schema/migrations/persist must see this account as the active one.
  runWithAccount(id, () => {
    applySchema();
    persist();
  });
  return database;
}

// Back-compat entry point: initialises the primary account. Existing callers
// (scripts, tests) keep the exact same signature and behaviour.
async function init(customPath) {
  return initAccount(DEFAULT_ACCOUNT_ID, customPath);
}

// Atomic on-disk write: export to a temp file, then rename over the target.
// rename(2) on the same filesystem is atomic, so a crash or power loss mid-write
// can never leave a truncated/corrupt database — the old file survives intact
// until the complete new one replaces it in a single step.
function persist() {
  const entry = accounts.get(currentAccountId());
  if (!entry || entry.dbPath === ':memory:') return;
  const dir = path.dirname(entry.dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = entry.db.export();
  const tmp = `${entry.dbPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, Buffer.from(data));
  fs.renameSync(tmp, entry.dbPath);
}

function requireDb() {
  const id = currentAccountId();
  const entry = accounts.get(id);
  if (!entry) throw new Error(`Database not initialized for account "${id}". Call init()/initAccount() first.`);
  return entry.db;
}

function run(sql, params = []) {
  requireDb().run(sql, params);
}

function all(sql, params = []) {
  const stmt = requireDb().prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function lastId() {
  return all('SELECT last_insert_rowid() AS id')[0].id;
}

function close() {
  for (const entry of accounts.values()) {
    try { entry.db.close(); } catch { /* ignore */ }
  }
  accounts.clear();
}

// ---------- backup (full dump / restore) ----------

// Every user table (skips SQLite's own internal ones), in creation order so a
// restore can insert parents before children.
function userTables() {
  return all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rootpage").map((r) => r.name);
}

// A plain, human-readable JSON snapshot of the whole database: every row of
// every table, ids and all. Lossless (relationships are preserved because the
// ids are kept) yet still legible in any text/JSON viewer.
function exportAll() {
  const tables = {};
  for (const t of userTables()) tables[t] = all(`SELECT * FROM "${t}"`);
  return { app: 'meinkursheft', version: 1, exportedAt: new Date().toISOString(), tables };
}

// Replaces the entire database contents with a snapshot produced by
// exportAll. Runs in one transaction with foreign keys deferred so table
// order doesn't matter; only columns that still exist in the current schema
// are inserted, so a snapshot from a slightly older/newer schema still loads.
function importAll(payload) {
  const snapshot = payload && payload.tables;
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Invalid backup: missing tables');

  const tables = userTables();
  const colsByTable = {};
  for (const t of tables) colsByTable[t] = all(`PRAGMA table_info("${t}")`).map((c) => c.name);

  const database = requireDb();
  database.run('PRAGMA foreign_keys = OFF');
  database.run('BEGIN');
  try {
    // Clear children before parents (reverse creation order).
    for (const t of [...tables].reverse()) database.run(`DELETE FROM "${t}"`);
    for (const t of tables) {
      const rows = snapshot[t];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => colsByTable[t].includes(c));
        if (!cols.length) continue;
        const sql = `INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
        database.run(sql, cols.map((c) => row[c]));
      }
    }
    database.run('COMMIT');
  } catch (err) {
    database.run('ROLLBACK');
    database.run('PRAGMA foreign_keys = ON');
    throw err;
  }
  database.run('PRAGMA foreign_keys = ON');
  persist();
}

// ---------- students ----------

function listStudents() {
  return all(
    `SELECT s.*, k.name AS klasse_name
     FROM students s
     LEFT JOIN klassen k ON k.id = s.klasse_id
     ORDER BY s.last_name ASC, s.first_name ASC`
  );
}

function createStudent({ firstName, lastName, klasseId }) {
  run('INSERT INTO students (first_name, last_name, klasse_id) VALUES (?, ?, ?)', [firstName, lastName, klasseId ?? null]);
  const id = lastId();
  persist();
  return get('SELECT * FROM students WHERE id = ?', [id]);
}

function updateStudent(id, { firstName, lastName, klasseId }) {
  const cur = get('SELECT * FROM students WHERE id = ?', [id]);
  if (!cur) return null;
  run('UPDATE students SET first_name = ?, last_name = ?, klasse_id = ? WHERE id = ?', [
    firstName !== undefined ? firstName : cur.first_name,
    lastName !== undefined ? lastName : cur.last_name,
    klasseId !== undefined ? klasseId : cur.klasse_id,
    id,
  ]);
  persist();
  return get('SELECT * FROM students WHERE id = ?', [id]);
}

function deleteStudent(id) {
  run('DELETE FROM students WHERE id = ?', [id]);
  persist();
}

// ---------- klassen ----------

function listKlassen() {
  return all('SELECT * FROM klassen ORDER BY name ASC');
}

// Jahrgang is no longer tracked -- a class is just its name. The column is
// kept (NOT NULL) only so pre-existing databases don't need a destructive
// migration; every new row just gets 0.
function createKlasse({ name }) {
  run('INSERT INTO klassen (name, jahrgang) VALUES (?, 0)', [name]);
  const id = lastId();
  persist();
  return get('SELECT * FROM klassen WHERE id = ?', [id]);
}

// ---------- courses ----------

// Quarter date ranges are meant to be the same across every course (set once
// in the school-wide "Quartalsdaten" screen), so a newly created course
// should inherit whatever ranges are already in use rather than resetting
// everyone back to the hardcoded defaults.
function referenceQuarterRanges(excludeCourseId) {
  const rows = all(
    `SELECT idx, start_date, end_date FROM quarters
     WHERE course_id = (SELECT id FROM courses WHERE id != ? ORDER BY id ASC LIMIT 1)
     ORDER BY idx ASC`,
    [excludeCourseId]
  );
  if (rows.length === 4) return rows.map((r) => [r.start_date, r.end_date]);
  return DEFAULT_QUARTER_RANGES;
}

function seedQuartersAndHalves(courseId, yearId) {
  // A course inherits its year's quarter calendar (the single source of truth
  // for dates). These per-course date columns are vestigial -- always overlaid
  // with the year's dates on read -- but seeding them sensibly keeps old
  // reads/backups coherent. Fall back to any existing course's ranges, then the
  // hardcoded defaults, for a course without a year.
  const yq = yearId ? getYearQuarters(yearId) : [];
  const ranges = yq.length === 4 ? yq.map((q) => [q.start_date, q.end_date]) : referenceQuarterRanges(courseId);
  for (let hi = 1; hi <= 2; hi++) {
    run('INSERT INTO halves (course_id, idx, weight) VALUES (?, ?, 1)', [courseId, hi]);
    const halfId = lastId();
    const qIndices = hi === 1 ? [1, 2] : [3, 4];
    qIndices.forEach((qi) => {
      const [start, end] = ranges[qi - 1];
      run(
        `INSERT INTO quarters (course_id, half_id, idx, start_date, end_date, weight_mitarbeit, weight_schriftlich, weight_quarter)
         VALUES (?, ?, ?, ?, ?, 1, 1, 1)`,
        [courseId, halfId, qi, start, end]
      );
    });
  }
}

function listCourses() {
  return all('SELECT * FROM courses ORDER BY id ASC');
}

function getCourse(id) {
  return get('SELECT * FROM courses WHERE id = ?', [id]);
}

function createCourse({ name, hoursPerWeek, yearId }) {
  run('INSERT INTO courses (name, hours_per_week, year_id) VALUES (?, ?, ?)', [name, hoursPerWeek || 1, yearId ?? null]);
  const id = lastId();
  seedQuartersAndHalves(id, yearId ?? null);
  persist();
  return getCourse(id);
}

function updateCourse(id, { name, hoursPerWeek }) {
  const cur = getCourse(id);
  if (!cur) return null;
  run('UPDATE courses SET name = ?, hours_per_week = ? WHERE id = ?', [
    name !== undefined ? name : cur.name,
    hoursPerWeek !== undefined ? hoursPerWeek : cur.hours_per_week,
    id,
  ]);
  persist();
  return getCourse(id);
}

function deleteCourse(id) {
  // remarks.target_id is a polymorphic reference (lesson or written_work),
  // so it can't be a real foreign key and the ON DELETE CASCADE on
  // lessons/written_works.course_id won't reach it. Clean those up first.
  run('DELETE FROM remarks WHERE target_type = ? AND target_id IN (SELECT id FROM lessons WHERE course_id = ?)', ['lesson', id]);
  run('DELETE FROM remarks WHERE target_type = ? AND target_id IN (SELECT id FROM written_works WHERE course_id = ?)', ['written_work', id]);
  run('DELETE FROM courses WHERE id = ?', [id]);
  persist();
}

// ---------- enrollment ----------

function listEnrolledStudents(courseId) {
  return all(
    `SELECT s.*, k.name AS klasse_name
     FROM students s
     JOIN course_students cs ON cs.student_id = s.id
     LEFT JOIN klassen k ON k.id = s.klasse_id
     WHERE cs.course_id = ?
     ORDER BY s.last_name ASC, s.first_name ASC`,
    [courseId]
  );
}

function enrollStudent(courseId, studentId) {
  run('INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)', [courseId, studentId]);
  persist();
}

function unenrollStudent(courseId, studentId) {
  run('DELETE FROM course_students WHERE course_id = ? AND student_id = ?', [courseId, studentId]);
  persist();
}

// ---------- halves / quarters ----------

function listHalves(courseId) {
  return all('SELECT * FROM halves WHERE course_id = ? ORDER BY idx ASC', [courseId]);
}

function listQuarters(courseId) {
  return all('SELECT * FROM quarters WHERE course_id = ? ORDER BY idx ASC', [courseId]);
}

function updateHalf(id, { weight }) {
  const cur = get('SELECT * FROM halves WHERE id = ?', [id]);
  if (!cur) return null;
  let nextWeight = weight !== undefined ? weight : cur.weight;
  // A locked HJ-Note column freezes its weight.
  if (weight !== undefined && isAverageColumnLocked({ courseId: cur.course_id, kind: 'hjNote', refId: id })) nextWeight = cur.weight;
  run('UPDATE halves SET weight = ? WHERE id = ?', [nextWeight, id]);
  persist();
  return get('SELECT * FROM halves WHERE id = ?', [id]);
}

function updateQuarter(id, patch) {
  const cur = get('SELECT * FROM quarters WHERE id = ?', [id]);
  if (!cur) return null;
  const next = {
    start_date: patch.startDate !== undefined ? patch.startDate : cur.start_date,
    end_date: patch.endDate !== undefined ? patch.endDate : cur.end_date,
    weight_mitarbeit: patch.weightMitarbeit !== undefined ? patch.weightMitarbeit : cur.weight_mitarbeit,
    weight_schriftlich: patch.weightSchriftlich !== undefined ? patch.weightSchriftlich : cur.weight_schriftlich,
    weight_quarter: patch.weightQuarter !== undefined ? patch.weightQuarter : cur.weight_quarter,
  };
  // A locked Ø-Mitarbeit / Ø-Klassenarbeiten / Q-Note column freezes its own weight.
  const cid = cur.course_id;
  if (patch.weightMitarbeit !== undefined && isAverageColumnLocked({ courseId: cid, kind: 'mitAvg', refId: id })) next.weight_mitarbeit = cur.weight_mitarbeit;
  if (patch.weightSchriftlich !== undefined && isAverageColumnLocked({ courseId: cid, kind: 'schrAvg', refId: id })) next.weight_schriftlich = cur.weight_schriftlich;
  if (patch.weightQuarter !== undefined && isAverageColumnLocked({ courseId: cid, kind: 'qNote', refId: id })) next.weight_quarter = cur.weight_quarter;
  run(
    'UPDATE quarters SET start_date = ?, end_date = ?, weight_mitarbeit = ?, weight_schriftlich = ?, weight_quarter = ? WHERE id = ?',
    [next.start_date, next.end_date, next.weight_mitarbeit, next.weight_schriftlich, next.weight_quarter, id]
  );
  persist();
  return get('SELECT * FROM quarters WHERE id = ?', [id]);
}

// ---------- remarks ----------

function getRemark(id) {
  return get('SELECT * FROM remarks WHERE id = ?', [id]);
}

function listRemarks(targetType, targetId) {
  return all('SELECT * FROM remarks WHERE target_type = ? AND target_id = ? ORDER BY id ASC', [targetType, targetId]);
}

function listRemarksForCourseTargets(targetType, targetIds) {
  if (!targetIds.length) return [];
  const placeholders = targetIds.map(() => '?').join(',');
  return all(
    `SELECT * FROM remarks WHERE target_type = ? AND target_id IN (${placeholders}) ORDER BY id ASC`,
    [targetType, ...targetIds]
  );
}

function createRemark({ targetType, targetId, studentId, emoji, text }) {
  run('INSERT INTO remarks (target_type, target_id, student_id, emoji, text) VALUES (?, ?, ?, ?, ?)', [
    targetType,
    targetId,
    studentId,
    emoji || '',
    text,
  ]);
  const id = lastId();
  persist();
  return get('SELECT * FROM remarks WHERE id = ?', [id]);
}

function updateRemark(id, { emoji, text }) {
  const cur = get('SELECT * FROM remarks WHERE id = ?', [id]);
  if (!cur) return null;
  run('UPDATE remarks SET emoji = ?, text = ? WHERE id = ?', [
    emoji !== undefined ? emoji : cur.emoji,
    text !== undefined ? text : cur.text,
    id,
  ]);
  persist();
  return get('SELECT * FROM remarks WHERE id = ?', [id]);
}

function deleteRemark(id) {
  run('DELETE FROM remarks WHERE id = ?', [id]);
  persist();
}

function listRemarkPresets() {
  return all('SELECT * FROM remark_presets ORDER BY id ASC');
}

function createRemarkPreset({ emoji, text }) {
  run('INSERT INTO remark_presets (emoji, text) VALUES (?, ?)', [emoji || '', text]);
  const id = lastId();
  persist();
  return get('SELECT * FROM remark_presets WHERE id = ?', [id]);
}

function deleteRemarkPreset(id) {
  run('DELETE FROM remark_presets WHERE id = ?', [id]);
  persist();
}

// ---------- lessons ----------

function listLessons(courseId) {
  return all('SELECT * FROM lessons WHERE course_id = ? ORDER BY date ASC, id ASC', [courseId]);
}

function getLesson(id) {
  return get('SELECT * FROM lessons WHERE id = ?', [id]);
}

// A unit spanning several Schulstunden weighs as many grade-points as it has
// hours, so weight defaults to durationHours unless a caller overrides it
// (later manual edits in the Notenübersicht set it explicitly). end_date
// defaults to date, i.e. a single-day unit.
function createLesson({ courseId, quarterId, date, endDate, durationHours, topic, content, note, weight }) {
  const dur = durationHours || 1;
  run(
    `INSERT INTO lessons (course_id, quarter_id, date, end_date, duration_hours, topic, content, note, weight)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [courseId, quarterId, date, endDate || date, dur, topic || '', content || '', note || '', weight !== undefined ? weight : dur]
  );
  const id = lastId();
  persist();
  return get('SELECT * FROM lessons WHERE id = ?', [id]);
}

function updateLesson(id, patch) {
  const cur = get('SELECT * FROM lessons WHERE id = ?', [id]);
  if (!cur) return null;
  const next = {
    quarter_id: patch.quarterId !== undefined ? patch.quarterId : cur.quarter_id,
    date: patch.date !== undefined ? patch.date : cur.date,
    end_date: patch.endDate !== undefined ? patch.endDate : cur.end_date,
    duration_hours: patch.durationHours !== undefined ? patch.durationHours : cur.duration_hours,
    topic: patch.topic !== undefined ? patch.topic : cur.topic,
    content: patch.content !== undefined ? patch.content : cur.content,
    note: patch.note !== undefined ? patch.note : cur.note,
    // A lesson's weight defaults to its Schulstunden count: when the duration
    // changes and no explicit weight is given, keep the weight equal to it.
    weight:
      patch.weight !== undefined
        ? patch.weight
        : patch.durationHours !== undefined
          ? patch.durationHours
          : cur.weight,
    grades_locked: patch.gradesLocked !== undefined ? (patch.gradesLocked ? 1 : 0) : cur.grades_locked,
  };
  // A locked grade set freezes its weight too -- ignore any weight change
  // unless this same patch is the one unlocking it.
  if (cur.grades_locked && patch.gradesLocked !== false) next.weight = cur.weight;
  run(
    'UPDATE lessons SET quarter_id = ?, date = ?, end_date = ?, duration_hours = ?, topic = ?, content = ?, note = ?, weight = ?, grades_locked = ? WHERE id = ?',
    [next.quarter_id, next.date, next.end_date, next.duration_hours, next.topic, next.content, next.note, next.weight, next.grades_locked, id]
  );
  persist();
  return get('SELECT * FROM lessons WHERE id = ?', [id]);
}

function deleteLesson(id) {
  run('DELETE FROM remarks WHERE target_type = ? AND target_id = ?', ['lesson', id]);
  run('DELETE FROM lessons WHERE id = ?', [id]);
  persist();
}

function listAttendance(lessonId) {
  return all('SELECT * FROM attendance WHERE lesson_id = ?', [lessonId]);
}

function setAttendance(lessonId, studentId, { status, lateMinutes, excused }) {
  const cur = get('SELECT * FROM attendance WHERE lesson_id = ? AND student_id = ?', [lessonId, studentId]);
  const next = {
    status: status !== undefined ? status : cur ? cur.status : 'anwesend',
    late_minutes: lateMinutes !== undefined ? lateMinutes : cur ? cur.late_minutes : null,
    excused: excused !== undefined ? (excused ? 1 : 0) : cur ? cur.excused : 0,
  };
  run(
    `INSERT INTO attendance (lesson_id, student_id, status, late_minutes, excused) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(lesson_id, student_id) DO UPDATE SET status = excluded.status, late_minutes = excluded.late_minutes, excused = excluded.excused`,
    [lessonId, studentId, next.status, next.late_minutes, next.excused]
  );
  persist();
  return get('SELECT * FROM attendance WHERE lesson_id = ? AND student_id = ?', [lessonId, studentId]);
}

function listParticipationGrades(lessonId) {
  return all('SELECT * FROM participation_grades WHERE lesson_id = ?', [lessonId]);
}

// A locked grade set (lesson.grades_locked) blocks any grade write, so a
// stray call -- including the automatic "clear grade when marked absent" and
// any live-sync race from another client -- can never silently overwrite a
// protected grade. Toggling the set lock rides updateLesson's gradesLocked.
function setParticipationGrade(lessonId, studentId, grade) {
  const lesson = get('SELECT grades_locked FROM lessons WHERE id = ?', [lessonId]);
  const cur = get('SELECT * FROM participation_grades WHERE lesson_id = ? AND student_id = ?', [lessonId, studentId]);
  if (lesson && lesson.grades_locked) return cur;
  run(
    `INSERT INTO participation_grades (lesson_id, student_id, grade) VALUES (?, ?, ?)
     ON CONFLICT(lesson_id, student_id) DO UPDATE SET grade = excluded.grade`,
    [lessonId, studentId, grade]
  );
  persist();
  return get('SELECT * FROM participation_grades WHERE lesson_id = ? AND student_id = ?', [lessonId, studentId]);
}

// ---------- written works ----------

function listWrittenWorks(courseId) {
  return all('SELECT * FROM written_works WHERE course_id = ? ORDER BY date ASC, id ASC', [courseId]);
}

function getWrittenWork(id) {
  return get('SELECT * FROM written_works WHERE id = ?', [id]);
}

function createWrittenWork({ courseId, quarterId, kind, title, content, date, weight }) {
  run(
    `INSERT INTO written_works (course_id, quarter_id, kind, title, content, date, weight)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [courseId, quarterId, kind, title, content || '', date, weight !== undefined ? weight : 1]
  );
  const id = lastId();
  persist();
  return get('SELECT * FROM written_works WHERE id = ?', [id]);
}

function updateWrittenWork(id, patch) {
  const cur = get('SELECT * FROM written_works WHERE id = ?', [id]);
  if (!cur) return null;
  const next = {
    quarter_id: patch.quarterId !== undefined ? patch.quarterId : cur.quarter_id,
    kind: patch.kind !== undefined ? patch.kind : cur.kind,
    title: patch.title !== undefined ? patch.title : cur.title,
    content: patch.content !== undefined ? patch.content : cur.content,
    date: patch.date !== undefined ? patch.date : cur.date,
    weight: patch.weight !== undefined ? patch.weight : cur.weight,
    grades_locked: patch.gradesLocked !== undefined ? (patch.gradesLocked ? 1 : 0) : cur.grades_locked,
  };
  // A locked grade set freezes its weight too (see updateLesson).
  if (cur.grades_locked && patch.gradesLocked !== false) next.weight = cur.weight;
  run(
    'UPDATE written_works SET quarter_id = ?, kind = ?, title = ?, content = ?, date = ?, weight = ?, grades_locked = ? WHERE id = ?',
    [next.quarter_id, next.kind, next.title, next.content, next.date, next.weight, next.grades_locked, id]
  );
  persist();
  return get('SELECT * FROM written_works WHERE id = ?', [id]);
}

function deleteWrittenWork(id) {
  run('DELETE FROM remarks WHERE target_type = ? AND target_id = ?', ['written_work', id]);
  run('DELETE FROM written_works WHERE id = ?', [id]);
  persist();
}

function listWrittenWorkGrades(writtenWorkId) {
  return all('SELECT * FROM written_work_grades WHERE written_work_id = ?', [writtenWorkId]);
}

// Same set-lock enforcement as participation grades (see setParticipationGrade).
function setWrittenWorkGrade(writtenWorkId, studentId, grade) {
  const work = get('SELECT grades_locked FROM written_works WHERE id = ?', [writtenWorkId]);
  const cur = get('SELECT * FROM written_work_grades WHERE written_work_id = ? AND student_id = ?', [writtenWorkId, studentId]);
  if (work && work.grades_locked) return cur;
  run(
    `INSERT INTO written_work_grades (written_work_id, student_id, grade) VALUES (?, ?, ?)
     ON CONFLICT(written_work_id, student_id) DO UPDATE SET grade = excluded.grade`,
    [writtenWorkId, studentId, grade]
  );
  persist();
  return get('SELECT * FROM written_work_grades WHERE written_work_id = ? AND student_id = ?', [writtenWorkId, studentId]);
}

// ---------- grade overrides ----------

function listGradeOverrides(courseId) {
  return all('SELECT * FROM grade_overrides WHERE course_id = ?', [courseId]);
}

// A locked average cell can neither be overridden nor reset, so its value
// stays put; toggling the lock itself goes through setAverageLock.
function setGradeOverride({ courseId, studentId, kind, refId, grade }) {
  if (isAverageLocked({ courseId, studentId, kind, refId })) {
    return get('SELECT * FROM grade_overrides WHERE course_id = ? AND student_id = ? AND kind = ? AND ref_id = ?', [courseId, studentId, kind, refId]);
  }
  run(
    `INSERT INTO grade_overrides (course_id, student_id, kind, ref_id, grade) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(course_id, student_id, kind, ref_id) DO UPDATE SET grade = excluded.grade`,
    [courseId, studentId, kind, refId, grade]
  );
  persist();
  return get('SELECT * FROM grade_overrides WHERE course_id = ? AND student_id = ? AND kind = ? AND ref_id = ?', [courseId, studentId, kind, refId]);
}

function deleteGradeOverride({ courseId, studentId, kind, refId }) {
  if (isAverageLocked({ courseId, studentId, kind, refId })) return;
  run('DELETE FROM grade_overrides WHERE course_id = ? AND student_id = ? AND kind = ? AND ref_id = ?', [courseId, studentId, kind, refId]);
  persist();
}

// ---------- average locks ----------

function listAverageLocks(courseId) {
  return all('SELECT * FROM average_locks WHERE course_id = ?', [courseId]);
}

function isAverageLocked({ courseId, studentId, kind, refId }) {
  return !!get('SELECT id FROM average_locks WHERE course_id = ? AND student_id = ? AND kind = ? AND ref_id = ?', [courseId, studentId, kind, refId]);
}

function setAverageLock({ courseId, studentId, kind, refId, locked }) {
  if (locked) {
    run(
      `INSERT INTO average_locks (course_id, student_id, kind, ref_id) VALUES (?, ?, ?, ?)
       ON CONFLICT(course_id, student_id, kind, ref_id) DO NOTHING`,
      [courseId, studentId, kind, refId]
    );
  } else {
    run('DELETE FROM average_locks WHERE course_id = ? AND student_id = ? AND kind = ? AND ref_id = ?', [courseId, studentId, kind, refId]);
  }
  persist();
  return { course_id: courseId, student_id: studentId, kind, ref_id: refId, locked: isAverageLocked({ courseId, studentId, kind, refId }) };
}

// Column-level average lock: a whole Ø/Q/HJ/Zeugnis column is "locked" when
// every enrolled student's cell in it is locked. Locking the column freezes
// that column's weight too (updateQuarter/updateHalf below).
function isAverageColumnLocked({ courseId, kind, refId }) {
  const students = all('SELECT student_id FROM course_students WHERE course_id = ?', [courseId]);
  if (!students.length) return false;
  return students.every((s) => isAverageLocked({ courseId, studentId: s.student_id, kind, refId }));
}

function setAverageLockColumn({ courseId, kind, refId, locked }) {
  const students = all('SELECT student_id FROM course_students WHERE course_id = ?', [courseId]);
  students.forEach((s) => {
    if (locked) {
      run(
        `INSERT INTO average_locks (course_id, student_id, kind, ref_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(course_id, student_id, kind, ref_id) DO NOTHING`,
        [courseId, s.student_id, kind, refId]
      );
    } else {
      run('DELETE FROM average_locks WHERE course_id = ? AND student_id = ? AND kind = ? AND ref_id = ?', [courseId, s.student_id, kind, refId]);
    }
  });
  persist();
  return { course_id: courseId, kind, ref_id: refId, locked: isAverageColumnLocked({ courseId, kind, refId }) };
}

// ---------- bundle (everything a course screen needs, in one shot) ----------

function getCourseBundle(courseId) {
  const course = getCourse(courseId);
  if (!course) return null;

  const students = listEnrolledStudents(courseId);
  // Overlay the year's quarter dates (single source of truth) onto the course's
  // quarter rows, so every course in a year always shows the same calendar
  // regardless of what its own vestigial date columns hold.
  const yqByIdx = new Map(getYearQuarters(course.year_id).map((q) => [q.idx, q]));
  const quarters = listQuarters(courseId).map((q) => {
    const yr = yqByIdx.get(q.idx);
    return yr ? { ...q, start_date: yr.start_date, end_date: yr.end_date } : q;
  });
  const halves = listHalves(courseId);

  const lessonRows = listLessons(courseId);
  const lessonIds = lessonRows.map((l) => l.id);
  const lessonRemarks = listRemarksForCourseTargets('lesson', lessonIds);
  const lessons = lessonRows.map((lesson) => ({
    ...lesson,
    attendance: listAttendance(lesson.id),
    grades: listParticipationGrades(lesson.id),
    remarks: lessonRemarks.filter((r) => r.target_id === lesson.id),
  }));

  const workRows = listWrittenWorks(courseId);
  const workIds = workRows.map((w) => w.id);
  const workRemarks = listRemarksForCourseTargets('written_work', workIds);
  const writtenWorks = workRows.map((work) => ({
    ...work,
    grades: listWrittenWorkGrades(work.id),
    remarks: workRemarks.filter((r) => r.target_id === work.id),
  }));

  const gradeOverrides = listGradeOverrides(courseId);
  const averageLocks = listAverageLocks(courseId);

  return { course, students, quarters, halves, lessons, writtenWorks, gradeOverrides, averageLocks };
}

// ---------- school years ----------

function listSchoolYears() {
  return all('SELECT * FROM school_years ORDER BY sort_order ASC, id ASC');
}

function getSchoolYear(id) {
  return get('SELECT * FROM school_years WHERE id = ?', [id]);
}

function isYearArchived(id) {
  const y = getSchoolYear(id);
  return !!(y && y.archived);
}

function isCourseInArchivedYear(courseId) {
  const c = getCourse(courseId);
  return !!(c && c.year_id && isYearArchived(c.year_id));
}

// A new year always gets a quarter calendar: copied from a source year if one
// is given (year rollover), otherwise the hardcoded defaults.
function createSchoolYear({ label, copyQuartersFromYearId } = {}) {
  const max = get('SELECT MAX(sort_order) AS m FROM school_years');
  const sortOrder = (max && max.m != null ? max.m : -1) + 1;
  run('INSERT INTO school_years (label, sort_order, archived) VALUES (?, ?, 0)', [label, sortOrder]);
  const id = lastId();
  const src = copyQuartersFromYearId ? getYearQuarters(copyQuartersFromYearId) : [];
  const ranges = src.length === 4 ? src.map((q) => [q.start_date, q.end_date]) : DEFAULT_QUARTER_RANGES;
  ranges.forEach(([s, e], i) => run(
    'INSERT OR IGNORE INTO year_quarters (year_id, idx, start_date, end_date) VALUES (?, ?, ?, ?)',
    [id, i + 1, s, e]
  ));
  persist();
  return getSchoolYear(id);
}

function renameSchoolYear(id, label) {
  run('UPDATE school_years SET label = ? WHERE id = ?', [label, id]);
  persist();
  return getSchoolYear(id);
}

function setSchoolYearArchived(id, archived) {
  run('UPDATE school_years SET archived = ? WHERE id = ?', [archived ? 1 : 0, id]);
  persist();
  return getSchoolYear(id);
}

// Hard delete: cascades to the year's courses (and through them lessons/grades),
// classes, memberships and quarter calendar. Callers gate this behind an
// explicit label-confirmation. Keeps ui_last_year_id pointing somewhere valid.
function deleteSchoolYear(id) {
  run('DELETE FROM school_years WHERE id = ?', [id]);
  const last = get('SELECT value FROM app_meta WHERE key = ?', ['ui_last_year_id']);
  if (last && String(last.value) === String(id)) {
    const fallback = get('SELECT id FROM school_years ORDER BY sort_order DESC, id DESC LIMIT 1');
    if (fallback) run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', ['ui_last_year_id', String(fallback.id)]);
    else run('DELETE FROM app_meta WHERE key = ?', ['ui_last_year_id']);
  }
  persist();
}

// The year the UI should open on: the last one viewed, falling back to the
// newest year if that's gone/never set.
function getUiLastYearId() {
  const row = get('SELECT value FROM app_meta WHERE key = ?', ['ui_last_year_id']);
  const id = row ? Number(row.value) : null;
  if (id && getSchoolYear(id)) return id;
  const first = get('SELECT id FROM school_years ORDER BY sort_order DESC, id DESC LIMIT 1');
  return first ? first.id : null;
}

function setUiLastYearId(id) {
  run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', ['ui_last_year_id', String(id)]);
  persist();
}

// ---------- year quarters (single source of truth for quarter dates) ----------

function getYearQuarters(yearId) {
  return all('SELECT * FROM year_quarters WHERE year_id = ? ORDER BY idx ASC', [yearId]);
}

// Upserts one or more quarter date ranges for a year. Accepts either
// { idx, startDate, endDate } objects or [start, end] pairs (index-based).
function setYearQuarters(yearId, ranges) {
  ranges.forEach((r, i) => {
    const idx = r.idx != null ? r.idx : i + 1;
    const start = r.startDate != null ? r.startDate : r[0];
    const end = r.endDate != null ? r.endDate : r[1];
    run(
      `INSERT INTO year_quarters (year_id, idx, start_date, end_date) VALUES (?, ?, ?, ?)
       ON CONFLICT(year_id, idx) DO UPDATE SET start_date = excluded.start_date, end_date = excluded.end_date`,
      [yearId, idx, start, end]
    );
  });
  persist();
  return getYearQuarters(yearId);
}

// ---------- classes (year-scoped) ----------

function listClasses(yearId) {
  return all(
    `SELECT c.*, (SELECT COUNT(*) FROM student_year sy WHERE sy.class_id = c.id) AS member_count
     FROM classes c WHERE c.year_id = ? ORDER BY c.name ASC`,
    [yearId]
  );
}

function getClass(id) {
  return get('SELECT * FROM classes WHERE id = ?', [id]);
}

function createClass({ yearId, name }) {
  run('INSERT OR IGNORE INTO classes (year_id, name) VALUES (?, ?)', [yearId, name]);
  persist();
  return get('SELECT * FROM classes WHERE year_id = ? AND name = ?', [yearId, name]);
}

// Resolves a typed class name to an id within a year, creating it on the fly
// (mirrors the old resolveKlasseId UX, now year-scoped). '' -> null = Ohne Klasse.
// Matches case-insensitively so "10B" reuses an existing "10b".
function resolveClassId(yearId, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const existing = get('SELECT id FROM classes WHERE year_id = ? AND LOWER(name) = LOWER(?)', [yearId, trimmed]);
  if (existing) return existing.id;
  return createClass({ yearId, name: trimmed }).id;
}

function renameClass(id, name) {
  run('UPDATE classes SET name = ? WHERE id = ?', [name, id]);
  persist();
  return getClass(id);
}

// Deleting a class drops the grouping only: its members' student_year.class_id
// is SET NULL, so they stay in the year as "Ohne Klasse".
function deleteClass(id) {
  run('DELETE FROM classes WHERE id = ?', [id]);
  persist();
}

// ---------- students, year-scoped over the shared person pool ----------

// Every person, regardless of year membership -- the pool the import matches
// against and the "nirgends zugeordnet" cleanup draws from.
function listAllStudents() {
  return all('SELECT * FROM students ORDER BY last_name ASC, first_name ASC');
}

// Students in one year, with their class (klasse_name kept as the field name so
// the existing frontend keeps working). class_id NULL rows are "Ohne Klasse".
function listStudentsForYear(yearId) {
  return all(
    `SELECT s.*, sy.class_id, c.name AS klasse_name
     FROM student_year sy
     JOIN students s ON s.id = sy.student_id
     LEFT JOIN classes c ON c.id = sy.class_id
     WHERE sy.year_id = ?
     ORDER BY s.last_name ASC, s.first_name ASC`,
    [yearId]
  );
}

// Creates a NEW person in the pool and places them in the year (optionally in a
// class, created on the fly). This is the single-add form's path.
function createStudentInYear({ firstName, lastName, yearId, className }) {
  run('INSERT INTO students (first_name, last_name, klasse_id) VALUES (?, ?, NULL)', [firstName, lastName]);
  const id = lastId();
  const classId = resolveClassId(yearId, className);
  run('INSERT OR IGNORE INTO student_year (student_id, year_id, class_id) VALUES (?, ?, ?)', [id, yearId, classId]);
  persist();
  return get('SELECT * FROM students WHERE id = ?', [id]);
}

// Places an existing pool person into a year (import "link to existing", year
// rollover). Idempotent; updates the class if the membership already exists.
function addStudentToYear({ studentId, yearId, classId = null, className }) {
  const cid = className !== undefined ? resolveClassId(yearId, className) : classId;
  run(
    `INSERT INTO student_year (student_id, year_id, class_id) VALUES (?, ?, ?)
     ON CONFLICT(student_id, year_id) DO UPDATE SET class_id = excluded.class_id`,
    [studentId, yearId, cid]
  );
  persist();
}

// Renames the person (global) and/or moves them within the given year.
function updateStudentInYear(studentId, yearId, { firstName, lastName, className }) {
  const cur = get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!cur) return null;
  if (firstName !== undefined || lastName !== undefined) {
    run('UPDATE students SET first_name = ?, last_name = ? WHERE id = ?', [
      firstName !== undefined ? firstName : cur.first_name,
      lastName !== undefined ? lastName : cur.last_name,
      studentId,
    ]);
  }
  if (className !== undefined) {
    const classId = resolveClassId(yearId, className);
    run('UPDATE student_year SET class_id = ? WHERE student_id = ? AND year_id = ?', [classId, studentId, yearId]);
  }
  persist();
  return get('SELECT * FROM students WHERE id = ?', [studentId]);
}

// Removes a student from THIS year only -- the person survives in the pool and
// in every other year. (Course enrollments in this year's courses go with the
// course, which is year-scoped, so they're untouched here by design.)
function removeStudentFromYear(studentId, yearId) {
  run('DELETE FROM student_year WHERE student_id = ? AND year_id = ?', [studentId, yearId]);
  persist();
}

// Pool matches for the import's "same person?" prompt: exact first+last
// (case-insensitive), annotated with which years the match already appears in.
function findStudentsByName(firstName, lastName) {
  return all(
    `SELECT s.*,
            (SELECT GROUP_CONCAT(y.label, ', ')
             FROM student_year sy JOIN school_years y ON y.id = sy.year_id
             WHERE sy.student_id = s.id) AS years
     FROM students s
     WHERE LOWER(s.first_name) = LOWER(?) AND LOWER(s.last_name) = LOWER(?)`,
    [firstName, lastName]
  );
}

// People in no year at all -- the "nirgends zugeordnet" cleanup area, the only
// place a global (all-years) delete is offered.
function listUnassignedStudents() {
  return all(
    `SELECT s.* FROM students s
     WHERE NOT EXISTS (SELECT 1 FROM student_year sy WHERE sy.student_id = s.id)
     ORDER BY s.last_name ASC, s.first_name ASC`
  );
}

// ---------- courses, year-scoped ----------

function listCoursesForYear(yearId) {
  return all('SELECT * FROM courses WHERE year_id = ? ORDER BY id ASC', [yearId]);
}

// Copies a course into another year: same name + hours + enrolled roster
// (a snapshot -- no live coupling), weights left at their defaults. Any roster
// student not yet in the target year is added there as Ohne Klasse, so a
// carried course can never enroll someone who isn't a member of its year.
function carryCourseToYear({ courseId, toYearId }) {
  const src = getCourse(courseId);
  if (!src) return null;
  const created = createCourse({ name: src.name, hoursPerWeek: src.hours_per_week, yearId: toYearId });
  const roster = all('SELECT student_id FROM course_students WHERE course_id = ?', [courseId]);
  roster.forEach((r) => {
    run('INSERT OR IGNORE INTO student_year (student_id, year_id, class_id) VALUES (?, ?, NULL)', [r.student_id, toYearId]);
    run('INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)', [created.id, r.student_id]);
  });
  persist();
  return created;
}

// Advances a class into a new year under a new name, carrying all its members
// (same person identity). Used by the "Neues Schuljahr" rollover.
function carryClassToYear({ fromClassId, toYearId, newName }) {
  const cls = createClass({ yearId: toYearId, name: newName });
  const members = all('SELECT student_id FROM student_year WHERE class_id = ?', [fromClassId]);
  members.forEach((m) => run(
    `INSERT INTO student_year (student_id, year_id, class_id) VALUES (?, ?, ?)
     ON CONFLICT(student_id, year_id) DO UPDATE SET class_id = excluded.class_id`,
    [m.student_id, toYearId, cls.id]
  ));
  persist();
  return cls;
}

module.exports = {
  init,
  initAccount,
  runWithAccount,
  currentAccountId,
  DEFAULT_ACCOUNT_ID,
  persist,
  close,
  // backup
  exportAll,
  importAll,
  // students
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  // klassen
  listKlassen,
  createKlasse,
  // courses
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  // enrollment
  listEnrolledStudents,
  enrollStudent,
  unenrollStudent,
  // halves / quarters
  listHalves,
  listQuarters,
  updateHalf,
  updateQuarter,
  // remarks
  getRemark,
  listRemarks,
  createRemark,
  updateRemark,
  deleteRemark,
  listRemarkPresets,
  createRemarkPreset,
  deleteRemarkPreset,
  // lessons
  listLessons,
  getLesson,
  createLesson,
  updateLesson,
  deleteLesson,
  listAttendance,
  setAttendance,
  listParticipationGrades,
  setParticipationGrade,
  // written works
  listWrittenWorks,
  getWrittenWork,
  createWrittenWork,
  updateWrittenWork,
  deleteWrittenWork,
  listWrittenWorkGrades,
  setWrittenWorkGrade,
  // grade overrides
  listGradeOverrides,
  setGradeOverride,
  deleteGradeOverride,
  listAverageLocks,
  isAverageLocked,
  setAverageLock,
  isAverageColumnLocked,
  setAverageLockColumn,
  // bundle
  getCourseBundle,
  // school years
  listSchoolYears,
  getSchoolYear,
  createSchoolYear,
  renameSchoolYear,
  setSchoolYearArchived,
  deleteSchoolYear,
  isYearArchived,
  isCourseInArchivedYear,
  getUiLastYearId,
  setUiLastYearId,
  // year quarters (source of truth for dates)
  getYearQuarters,
  setYearQuarters,
  // classes (year-scoped)
  listClasses,
  getClass,
  createClass,
  resolveClassId,
  renameClass,
  deleteClass,
  // students, year-scoped
  listAllStudents,
  listStudentsForYear,
  createStudentInYear,
  addStudentToYear,
  updateStudentInYear,
  removeStudentFromYear,
  findStudentsByName,
  listUnassignedStudents,
  // courses, year-scoped + rollover
  listCoursesForYear,
  carryCourseToYear,
  carryClassToYear,
};
