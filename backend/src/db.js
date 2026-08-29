const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'scorespace.sqlite');

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
let db = null;
let dbPath = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL
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
  duration_hours REAL NOT NULL DEFAULT 1,
  topic TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
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
  weight REAL NOT NULL DEFAULT 1
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
`;

async function init(customPath) {
  if (!SQL) {
    SQL = await initSqlJs();
  }

  dbPath = customPath || process.env.DB_PATH || DEFAULT_DB_PATH;

  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  db.run(SCHEMA);

  if (!all('SELECT id FROM remark_presets').length) {
    DEFAULT_PRESETS.forEach((p) => run('INSERT INTO remark_presets (emoji, text) VALUES (?, ?)', [p.emoji, p.text]));
  }

  persist();
  return db;
}

function persist() {
  if (!db || dbPath === ':memory:') return;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function requireDb() {
  if (!db) throw new Error('Database not initialized. Call init() first.');
  return db;
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
  if (db) {
    db.close();
    db = null;
  }
}

// ---------- students ----------

function listStudents() {
  return all('SELECT * FROM students ORDER BY last_name ASC, first_name ASC');
}

function createStudent({ firstName, lastName }) {
  run('INSERT INTO students (first_name, last_name) VALUES (?, ?)', [firstName, lastName]);
  const id = lastId();
  persist();
  return get('SELECT * FROM students WHERE id = ?', [id]);
}

function updateStudent(id, { firstName, lastName }) {
  const cur = get('SELECT * FROM students WHERE id = ?', [id]);
  if (!cur) return null;
  run('UPDATE students SET first_name = ?, last_name = ? WHERE id = ?', [
    firstName !== undefined ? firstName : cur.first_name,
    lastName !== undefined ? lastName : cur.last_name,
    id,
  ]);
  persist();
  return get('SELECT * FROM students WHERE id = ?', [id]);
}

function deleteStudent(id) {
  run('DELETE FROM students WHERE id = ?', [id]);
  persist();
}

// ---------- courses ----------

function seedQuartersAndHalves(courseId) {
  for (let hi = 1; hi <= 2; hi++) {
    run('INSERT INTO halves (course_id, idx, weight) VALUES (?, ?, 1)', [courseId, hi]);
    const halfId = lastId();
    const qIndices = hi === 1 ? [1, 2] : [3, 4];
    qIndices.forEach((qi) => {
      const [start, end] = DEFAULT_QUARTER_RANGES[qi - 1];
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

function createCourse({ name, hoursPerWeek }) {
  run('INSERT INTO courses (name, hours_per_week) VALUES (?, ?)', [name, hoursPerWeek || 1]);
  const id = lastId();
  seedQuartersAndHalves(id);
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
    `SELECT s.* FROM students s
     JOIN course_students cs ON cs.student_id = s.id
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
  run('UPDATE halves SET weight = ? WHERE id = ?', [weight !== undefined ? weight : cur.weight, id]);
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

function createLesson({ courseId, quarterId, date, durationHours, topic, content, note }) {
  run(
    `INSERT INTO lessons (course_id, quarter_id, date, duration_hours, topic, content, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [courseId, quarterId, date, durationHours || 1, topic || '', content || '', note || '']
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
    duration_hours: patch.durationHours !== undefined ? patch.durationHours : cur.duration_hours,
    topic: patch.topic !== undefined ? patch.topic : cur.topic,
    content: patch.content !== undefined ? patch.content : cur.content,
    note: patch.note !== undefined ? patch.note : cur.note,
  };
  run(
    'UPDATE lessons SET quarter_id = ?, date = ?, duration_hours = ?, topic = ?, content = ?, note = ? WHERE id = ?',
    [next.quarter_id, next.date, next.duration_hours, next.topic, next.content, next.note, id]
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

function setParticipationGrade(lessonId, studentId, grade) {
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
  };
  run(
    'UPDATE written_works SET quarter_id = ?, kind = ?, title = ?, content = ?, date = ?, weight = ? WHERE id = ?',
    [next.quarter_id, next.kind, next.title, next.content, next.date, next.weight, id]
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

function setWrittenWorkGrade(writtenWorkId, studentId, grade) {
  run(
    `INSERT INTO written_work_grades (written_work_id, student_id, grade) VALUES (?, ?, ?)
     ON CONFLICT(written_work_id, student_id) DO UPDATE SET grade = excluded.grade`,
    [writtenWorkId, studentId, grade]
  );
  persist();
  return get('SELECT * FROM written_work_grades WHERE written_work_id = ? AND student_id = ?', [writtenWorkId, studentId]);
}

// ---------- bundle (everything a course screen needs, in one shot) ----------

function getCourseBundle(courseId) {
  const course = getCourse(courseId);
  if (!course) return null;

  const students = listEnrolledStudents(courseId);
  const quarters = listQuarters(courseId);
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

  return { course, students, quarters, halves, lessons, writtenWorks };
}

module.exports = {
  init,
  persist,
  close,
  // students
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
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
  // bundle
  getCourseBundle,
};
