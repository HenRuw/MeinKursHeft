const request = require('supertest');
const db = require('../src/db');
const { createServer } = require('../src/server');

let app;

beforeEach(async () => {
  await db.init(':memory:');
  ({ app } = createServer());
});

afterEach(() => {
  db.close();
});

describe('cascading deletes', () => {
  test('deleting a course removes its quarters, halves, lessons, attendance, grades, written works and remarks', () => {
    const course = db.createCourse({ name: 'Mathematik 9b' });
    const student = db.createStudent({ firstName: 'Amelie', lastName: 'Brandt' });
    db.enrollStudent(course.id, student.id);
    const quarterId = db.listQuarters(course.id)[0].id;

    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });
    db.setAttendance(lesson.id, student.id, { status: 'verspaetet' });
    db.setParticipationGrade(lesson.id, student.id, '2+');
    const remark = db.createRemark({ targetType: 'lesson', targetId: lesson.id, studentId: student.id, text: 'Aktiv' });

    const work = db.createWrittenWork({ courseId: course.id, quarterId, kind: 'test', title: 'Kurztest', date: '2026-10-09' });
    db.setWrittenWorkGrade(work.id, student.id, '1');

    db.deleteCourse(course.id);

    expect(db.listQuarters(course.id)).toEqual([]);
    expect(db.listHalves(course.id)).toEqual([]);
    expect(db.listLessons(course.id)).toEqual([]);
    expect(db.listAttendance(lesson.id)).toEqual([]);
    expect(db.listParticipationGrades(lesson.id)).toEqual([]);
    expect(db.listRemarks('lesson', lesson.id)).toEqual([]);
    expect(db.listWrittenWorks(course.id)).toEqual([]);
    expect(db.listWrittenWorkGrades(work.id)).toEqual([]);
    // the remark row itself is gone too (not just unreachable via the lesson)
    expect(db.getRemark(remark.id)).toBeNull();
    // the student, being a global roster entry, survives the course deletion
    expect(db.listStudents().map((s) => s.id)).toContain(student.id);
  });

  test('deleting a student removes their enrollment, attendance, grades and remarks but leaves the course intact', () => {
    const course = db.createCourse({ name: 'Deutsch 7a' });
    const student = db.createStudent({ firstName: 'Jonas', lastName: 'Krüger' });
    db.enrollStudent(course.id, student.id);
    const quarterId = db.listQuarters(course.id)[0].id;
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });
    db.setAttendance(lesson.id, student.id, { status: 'fehlt' });
    db.setParticipationGrade(lesson.id, student.id, '3');
    db.createRemark({ targetType: 'lesson', targetId: lesson.id, studentId: student.id, text: 'Fehlt' });

    db.deleteStudent(student.id);

    expect(db.listEnrolledStudents(course.id)).toEqual([]);
    expect(db.listAttendance(lesson.id)).toEqual([]);
    expect(db.listParticipationGrades(lesson.id)).toEqual([]);
    expect(db.listRemarks('lesson', lesson.id)).toEqual([]);
    expect(db.getCourse(course.id)).not.toBeNull();
    expect(db.listLessons(course.id)).toHaveLength(1);
  });

  test('unenrolling a student keeps their historical grades on past lessons intact', () => {
    const course = db.createCourse({ name: 'Informatik 10' });
    const student = db.createStudent({ firstName: 'Lea', lastName: 'Hoffmann' });
    db.enrollStudent(course.id, student.id);
    const quarterId = db.listQuarters(course.id)[0].id;
    const lesson = db.createLesson({ courseId: course.id, quarterId, date: '2026-09-07' });
    db.setParticipationGrade(lesson.id, student.id, '1');

    db.unenrollStudent(course.id, student.id);

    expect(db.listEnrolledStudents(course.id)).toEqual([]);
    expect(db.listParticipationGrades(lesson.id)).toMatchObject([{ student_id: student.id, grade: '1' }]);
  });
});

describe('404s for unknown ids', () => {
  test('PATCH /api/courses/:id on an unknown course', async () => {
    const res = await request(app).patch('/api/courses/9999').send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  test('PATCH /api/quarters/:id on an unknown quarter', async () => {
    const res = await request(app).patch('/api/quarters/9999').send({ weightQuarter: 2 });
    expect(res.status).toBe(404);
  });

  test('PATCH /api/halves/:id on an unknown half', async () => {
    const res = await request(app).patch('/api/halves/9999').send({ weight: 2 });
    expect(res.status).toBe(404);
  });

  test('PATCH /api/lessons/:id on an unknown lesson', async () => {
    const res = await request(app).patch('/api/lessons/9999').send({ topic: 'x' });
    expect(res.status).toBe(404);
  });

  test('PATCH /api/written-works/:id on an unknown written work', async () => {
    const res = await request(app).patch('/api/written-works/9999').send({ title: 'x' });
    expect(res.status).toBe(404);
  });

  test('PATCH /api/remarks/:id on an unknown remark', async () => {
    const res = await request(app).patch('/api/remarks/9999').send({ text: 'x' });
    expect(res.status).toBe(404);
  });

  test('GET /api/courses/:id/bundle on an unknown course', async () => {
    const res = await request(app).get('/api/courses/9999/bundle');
    expect(res.status).toBe(404);
  });
});

describe('bundle shape for a freshly created, empty course', () => {
  test('returns empty arrays, not undefined/null, for students/lessons/writtenWorks', async () => {
    const course = (await request(app).post('/api/courses').send({ name: 'Neuer Kurs' })).body;
    const bundle = (await request(app).get(`/api/courses/${course.id}/bundle`)).body;

    expect(bundle.students).toEqual([]);
    expect(bundle.lessons).toEqual([]);
    expect(bundle.writtenWorks).toEqual([]);
    expect(bundle.quarters).toHaveLength(4);
    expect(bundle.halves).toHaveLength(2);
  });
});

describe('quarter/half update partial patches', () => {
  test('updating only one weight field on a quarter leaves the others untouched', async () => {
    const course = (await request(app).post('/api/courses').send({ name: 'Mathematik LK 12' })).body;
    const bundle = (await request(app).get(`/api/courses/${course.id}/bundle`)).body;
    const quarter = bundle.quarters[0];

    const res = await request(app).patch(`/api/quarters/${quarter.id}`).send({ weightSchriftlich: 3 });
    expect(res.body).toMatchObject({
      weight_mitarbeit: quarter.weight_mitarbeit,
      weight_schriftlich: 3,
      weight_quarter: quarter.weight_quarter,
      start_date: quarter.start_date,
      end_date: quarter.end_date,
    });
  });
});
