const db = require('../src/db');

beforeEach(async () => {
  await db.init(':memory:');
});

afterEach(() => {
  db.close();
});

describe('students', () => {
  test('starts empty', () => {
    expect(db.listStudents()).toEqual([]);
  });

  test('creates a student and returns it with an id', () => {
    const student = db.createStudent({ firstName: 'Max', lastName: 'Mustermann' });
    expect(student).toMatchObject({ first_name: 'Max', last_name: 'Mustermann' });
    expect(student.id).toBeGreaterThan(0);
  });

  test('lists students sorted by last name then first name', () => {
    db.createStudent({ firstName: 'Ben', lastName: 'Weber' });
    db.createStudent({ firstName: 'Anna', lastName: 'Adler' });
    db.createStudent({ firstName: 'Ben', lastName: 'Adler' });

    const names = db.listStudents().map((s) => `${s.last_name}, ${s.first_name}`);
    expect(names).toEqual(['Adler, Anna', 'Adler, Ben', 'Weber, Ben']);
  });

  test('updates and deletes a student', () => {
    const student = db.createStudent({ firstName: 'Max', lastName: 'Mustermann' });
    const updated = db.updateStudent(student.id, { firstName: 'Moritz' });
    expect(updated).toMatchObject({ first_name: 'Moritz', last_name: 'Mustermann' });

    db.deleteStudent(student.id);
    expect(db.listStudents()).toEqual([]);
  });
});

describe('courses', () => {
  test('creates a course and auto-seeds 2 halves and 4 quarters', () => {
    const course = db.createCourse({ name: 'Mathematik 9b', hoursPerWeek: 4 });
    expect(course).toMatchObject({ name: 'Mathematik 9b', hours_per_week: 4 });

    expect(db.listHalves(course.id)).toHaveLength(2);
    const quarters = db.listQuarters(course.id);
    expect(quarters).toHaveLength(4);
    expect(quarters.map((q) => q.idx)).toEqual([1, 2, 3, 4]);
  });

  test('enrolls and unenrolls students, sorted by last name', () => {
    const course = db.createCourse({ name: 'Deutsch 7a' });
    const a = db.createStudent({ firstName: 'Zoe', lastName: 'Adler' });
    const b = db.createStudent({ firstName: 'Anna', lastName: 'Berger' });

    db.enrollStudent(course.id, a.id);
    db.enrollStudent(course.id, b.id);
    expect(db.listEnrolledStudents(course.id).map((s) => s.last_name)).toEqual(['Adler', 'Berger']);

    db.unenrollStudent(course.id, a.id);
    expect(db.listEnrolledStudents(course.id).map((s) => s.last_name)).toEqual(['Berger']);
  });

  test('updates quarter weights and dates', () => {
    const course = db.createCourse({ name: 'Informatik 10' });
    const [quarter] = db.listQuarters(course.id);
    const updated = db.updateQuarter(quarter.id, { weightMitarbeit: 2, weightSchriftlich: 3, startDate: '2026-09-01' });
    expect(updated).toMatchObject({ weight_mitarbeit: 2, weight_schriftlich: 3, start_date: '2026-09-01' });
  });
});

describe('lessons, attendance and participation grades', () => {
  let course;
  let student;
  let quarterId;

  beforeEach(() => {
    course = db.createCourse({ name: 'Mathematik LK 12' });
    student = db.createStudent({ firstName: 'Lea', lastName: 'Hoffmann' });
    db.enrollStudent(course.id, student.id);
    quarterId = db.listQuarters(course.id)[0].id;
  });

  test('creates a lesson scoped to a quarter', () => {
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07', topic: 'Terme' });
    expect(lesson).toMatchObject({ course_id: course.id, quarter_id: quarterId, topic: 'Terme' });
  });

  test('a new lesson defaults to unlocked (grades_locked = 0)', () => {
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });
    expect(lesson.grades_locked).toBe(0);
  });

  test('a single-hour unit collapses end_date onto date and weighs 1', () => {
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });
    expect(lesson).toMatchObject({ date: '2026-09-07', end_date: '2026-09-07', duration_hours: 1, weight: 1 });
  });

  test('a multi-Schulstunden unit keeps a von…bis span and weighs its hours', () => {
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07', endDate: '2026-09-09', durationHours: 3 });
    expect(lesson).toMatchObject({ date: '2026-09-07', end_date: '2026-09-09', duration_hours: 3, weight: 3 });
  });

  test('updateLesson can edit the span, Schulstunden count and weight after the fact', () => {
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });
    const updated = db.updateLesson(lesson.id, { date: '2026-09-14', endDate: '2026-09-16', durationHours: 3, weight: 3, topic: 'Projekt' });
    expect(updated).toMatchObject({ date: '2026-09-14', end_date: '2026-09-16', duration_hours: 3, weight: 3, topic: 'Projekt' });
  });

  test('sets attendance and participation grade for a student', () => {
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });

    const att = db.setAttendance(lesson.id, student.id, { status: 'verspaetet', lateMinutes: 7 });
    expect(att).toMatchObject({ status: 'verspaetet', late_minutes: 7 });

    const grade = db.setParticipationGrade(lesson.id, student.id, '2+');
    expect(grade).toMatchObject({ grade: '2+' });

    // upsert overwrites, doesn't duplicate
    db.setParticipationGrade(lesson.id, student.id, '1-');
    expect(db.listParticipationGrades(lesson.id)).toHaveLength(1);
    expect(db.listParticipationGrades(lesson.id)[0].grade).toBe('1-');
  });

  test('deleting a lesson removes its attendance and grades', () => {
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });
    db.setAttendance(lesson.id, student.id, { status: 'fehlt', excused: true });
    db.setParticipationGrade(lesson.id, student.id, '3');

    db.deleteLesson(lesson.id);
    expect(db.listAttendance(lesson.id)).toEqual([]);
    expect(db.listParticipationGrades(lesson.id)).toEqual([]);
  });

  test('a locked grade set also freezes its weight', () => {
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07', weight: 1 });
    db.updateLesson(lesson.id, { gradesLocked: true });
    expect(db.updateLesson(lesson.id, { weight: 5 }).weight).toBe(1); // ignored while locked
    expect(db.updateLesson(lesson.id, { gradesLocked: false, weight: 5 }).weight).toBe(5); // unlock + set
  });

  test('a locked grade set (grades_locked) blocks writes to every cell in it', () => {
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });
    db.setParticipationGrade(lesson.id, student.id, '3');
    db.updateLesson(lesson.id, { gradesLocked: true });

    db.setParticipationGrade(lesson.id, student.id, '1');
    expect(db.listParticipationGrades(lesson.id)[0].grade).toBe('3');

    db.updateLesson(lesson.id, { gradesLocked: false });
    db.setParticipationGrade(lesson.id, student.id, '1');
    expect(db.listParticipationGrades(lesson.id)[0].grade).toBe('1');
  });
});

describe('written works and grades', () => {
  test('creates a written work with a kind and grades it per student', () => {
    const course = db.createCourse({ name: 'Deutsch 7a' });
    const student = db.createStudent({ firstName: 'Noah', lastName: 'Petrov' });
    db.enrollStudent(course.id, student.id);
    const quarterId = db.listQuarters(course.id)[0].id;

    const work = db.createWrittenWork({
      courseId: course.id,
      quarterId,
      kind: 'klassenarbeit',
      title: '1. Klassenarbeit',
      date: '2026-11-12',
      weight: 2,
    });
    expect(work).toMatchObject({ kind: 'klassenarbeit', title: '1. Klassenarbeit', weight: 2 });

    const grade = db.setWrittenWorkGrade(work.id, student.id, '2-');
    expect(grade).toMatchObject({ grade: '2-' });
    expect(work.grades_locked).toBe(0); // a new work defaults to unlocked
  });
});

describe('grade overrides', () => {
  test('sets, overwrites and clears a manual override for a quarter average', () => {
    const course = db.createCourse({ name: 'Englisch 10c' });
    const student = db.createStudent({ firstName: 'Ben', lastName: 'Lorenz' });
    db.enrollStudent(course.id, student.id);
    const quarterId = db.listQuarters(course.id)[0].id;

    const created = db.setGradeOverride({ courseId: course.id, studentId: student.id, kind: 'qNote', refId: quarterId, grade: '2+' });
    expect(created).toMatchObject({ kind: 'qNote', ref_id: quarterId, grade: '2+' });
    expect(db.listGradeOverrides(course.id)).toHaveLength(1);

    const updated = db.setGradeOverride({ courseId: course.id, studentId: student.id, kind: 'qNote', refId: quarterId, grade: '3-' });
    expect(updated.grade).toBe('3-');
    expect(db.listGradeOverrides(course.id)).toHaveLength(1); // upsert, not a second row

    db.deleteGradeOverride({ courseId: course.id, studentId: student.id, kind: 'qNote', refId: quarterId });
    expect(db.listGradeOverrides(course.id)).toEqual([]);
  });

  test('an average column defaults to unlocked (open) with no lock rows', () => {
    const course = db.createCourse({ name: 'Kunst 8' });
    const student = db.createStudent({ firstName: 'Ida', lastName: 'Vogel' });
    db.enrollStudent(course.id, student.id);
    const q = db.listQuarters(course.id)[0];
    expect(db.listAverageLocks(course.id)).toEqual([]);
    expect(db.isAverageColumnLocked({ courseId: course.id, kind: 'mitAvg', refId: q.id })).toBe(false);
  });

  test('a locked average blocks overriding and resetting until it is unlocked', () => {
    const course = db.createCourse({ name: 'Chemie 10' });
    const student = db.createStudent({ firstName: 'Tim', lastName: 'Krämer' });
    db.enrollStudent(course.id, student.id);
    const quarterId = db.listQuarters(course.id)[0].id;
    const key = { courseId: course.id, studentId: student.id, kind: 'qNote', refId: quarterId };

    db.setGradeOverride({ ...key, grade: '2' });
    db.setAverageLock({ ...key, locked: true });
    expect(db.isAverageLocked(key)).toBe(true);

    // override change and reset are both no-ops while locked
    db.setGradeOverride({ ...key, grade: '5' });
    expect(db.listGradeOverrides(course.id)[0].grade).toBe('2');
    db.deleteGradeOverride(key);
    expect(db.listGradeOverrides(course.id)).toHaveLength(1);

    // unlock, then editing works again
    db.setAverageLock({ ...key, locked: false });
    db.setGradeOverride({ ...key, grade: '5' });
    expect(db.listGradeOverrides(course.id)[0].grade).toBe('5');
  });

  test('a column lock freezes every student cell and the column weight', () => {
    const course = db.createCourse({ name: 'Biologie 9' });
    const s1 = db.createStudent({ firstName: 'Ada', lastName: 'A' });
    const s2 = db.createStudent({ firstName: 'Bo', lastName: 'B' });
    db.enrollStudent(course.id, s1.id);
    db.enrollStudent(course.id, s2.id);
    const q = db.listQuarters(course.id)[0];

    db.setAverageLockColumn({ courseId: course.id, kind: 'mitAvg', refId: q.id, locked: true });
    expect(db.isAverageColumnLocked({ courseId: course.id, kind: 'mitAvg', refId: q.id })).toBe(true);
    expect(db.isAverageLocked({ courseId: course.id, studentId: s1.id, kind: 'mitAvg', refId: q.id })).toBe(true);

    const before = db.listQuarters(course.id)[0].weight_mitarbeit;
    db.updateQuarter(q.id, { weightMitarbeit: 9 });
    expect(db.listQuarters(course.id)[0].weight_mitarbeit).toBe(before); // frozen

    db.setAverageLockColumn({ courseId: course.id, kind: 'mitAvg', refId: q.id, locked: false });
    db.updateQuarter(q.id, { weightMitarbeit: 9 });
    expect(db.listQuarters(course.id)[0].weight_mitarbeit).toBe(9); // editable again
  });

  test('scopes overrides independently per kind, even with the same ref_id', () => {
    const course = db.createCourse({ name: 'Physik 11' });
    const student = db.createStudent({ firstName: 'Lea', lastName: 'Hoffmann' });
    db.enrollStudent(course.id, student.id);
    const quarterId = db.listQuarters(course.id)[0].id;

    db.setGradeOverride({ courseId: course.id, studentId: student.id, kind: 'mitAvg', refId: quarterId, grade: '1' });
    db.setGradeOverride({ courseId: course.id, studentId: student.id, kind: 'schrAvg', refId: quarterId, grade: '4' });

    expect(db.listGradeOverrides(course.id)).toHaveLength(2);
  });

  test('is included in the course bundle', () => {
    const course = db.createCourse({ name: 'Geschichte 8a' });
    const student = db.createStudent({ firstName: 'Marie', lastName: 'Schuster' });
    db.enrollStudent(course.id, student.id);
    const halfId = db.listHalves(course.id)[0].id;

    db.setGradeOverride({ courseId: course.id, studentId: student.id, kind: 'hjNote', refId: halfId, grade: '1-' });

    const bundle = db.getCourseBundle(course.id);
    expect(bundle.gradeOverrides).toMatchObject([{ kind: 'hjNote', ref_id: halfId, grade: '1-' }]);
  });
});

describe('remarks', () => {
  test('creates, updates and deletes a remark on a lesson', () => {
    const course = db.createCourse({ name: 'Mathematik 9b' });
    const student = db.createStudent({ firstName: 'Amelie', lastName: 'Brandt' });
    db.enrollStudent(course.id, student.id);
    const quarterId = db.listQuarters(course.id)[0].id;
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });

    const remark = db.createRemark({ targetType: 'lesson', targetId: lesson.id, studentId: student.id, emoji: '📕', text: 'Material vergessen' });
    expect(remark).toMatchObject({ target_type: 'lesson', target_id: lesson.id, text: 'Material vergessen' });

    const updated = db.updateRemark(remark.id, { text: 'Buch vergessen' });
    expect(updated.text).toBe('Buch vergessen');

    db.deleteRemark(remark.id);
    expect(db.listRemarks('lesson', lesson.id)).toEqual([]);
  });

  test('seeds default remark presets', () => {
    expect(db.listRemarkPresets().length).toBeGreaterThan(0);
  });
});

describe('course bundle', () => {
  test('assembles course, roster, quarters, lessons and written works with nested data', () => {
    const course = db.createCourse({ name: 'Mathematik 9b' });
    const student = db.createStudent({ firstName: 'Amelie', lastName: 'Brandt' });
    db.enrollStudent(course.id, student.id);
    const quarterId = db.listQuarters(course.id)[0].id;

    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });
    db.setParticipationGrade(lesson.id, student.id, '2+');
    db.createRemark({ targetType: 'lesson', targetId: lesson.id, studentId: student.id, text: 'Aktiv' });

    const work = db.createWrittenWork({ courseId: course.id, quarterId, kind: 'test', title: 'Kurztest', date: '2026-10-09' });
    db.setWrittenWorkGrade(work.id, student.id, '1');

    const bundle = db.getCourseBundle(course.id);
    expect(bundle.course.id).toBe(course.id);
    expect(bundle.students).toHaveLength(1);
    expect(bundle.quarters).toHaveLength(4);
    expect(bundle.halves).toHaveLength(2);
    expect(bundle.lessons).toHaveLength(1);
    expect(bundle.lessons[0].grades[0]).toMatchObject({ grade: '2+' });
    expect(bundle.lessons[0].remarks[0]).toMatchObject({ text: 'Aktiv' });
    expect(bundle.writtenWorks).toHaveLength(1);
    expect(bundle.writtenWorks[0].grades[0]).toMatchObject({ grade: '1' });
  });

  test('returns null for an unknown course', () => {
    expect(db.getCourseBundle(9999)).toBeNull();
  });
});
