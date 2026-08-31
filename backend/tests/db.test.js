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

  test('a locked individual grade cannot be overwritten until it is unlocked', () => {
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });
    db.setParticipationGrade(lesson.id, student.id, '2');
    db.setParticipationGradeLock(lesson.id, student.id, true);

    // write is ignored while locked
    db.setParticipationGrade(lesson.id, student.id, '5');
    expect(db.listParticipationGrades(lesson.id)[0].grade).toBe('2');

    // unlock, then the write goes through
    db.setParticipationGradeLock(lesson.id, student.id, false);
    db.setParticipationGrade(lesson.id, student.id, '5');
    expect(db.listParticipationGrades(lesson.id)[0].grade).toBe('5');
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
