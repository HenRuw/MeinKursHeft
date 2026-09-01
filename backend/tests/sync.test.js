const request = require('supertest');
const ioClient = require('socket.io-client');
const db = require('../src/db');
const { createServer } = require('../src/server');

let httpServer;
let app;
let port;
const openClients = [];

function connectClient() {
  const client = ioClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
  });
  openClients.push(client);
  return client;
}

beforeEach(async () => {
  await db.init(':memory:');
  ({ httpServer, app } = createServer({ enabled: false }));
  await new Promise((resolve) => {
    httpServer.listen(0, () => {
      port = httpServer.address().port;
      resolve();
    });
  });
});

afterEach(async () => {
  openClients.splice(0).forEach((client) => client.close());
  await new Promise((resolve) => httpServer.close(resolve));
  db.close();
});

test('creating a course over REST is visible directly in the database', async () => {
  const res = await request(app).post('/api/courses').send({ name: 'Mathematik 9b', hoursPerWeek: 4 });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ name: 'Mathematik 9b', hours_per_week: 4 });
  expect(db.listCourses()).toHaveLength(1);
});

test('a REST mutation broadcasts sync:changed to connected clients', (done) => {
  const client = connectClient();
  let sawInit = false;

  client.on('sync:changed', (payload) => {
    if (!sawInit) {
      // first event on connect is the generic 'init' notification
      expect(payload.resource).toBe('init');
      sawInit = true;
      return;
    }
    expect(payload).toMatchObject({ resource: 'courses' });
    done();
  });

  client.on('connect', () => {
    request(app).post('/api/courses').send({ name: 'Deutsch 7a' }).end(() => {});
  });
});

test('the full course bundle reflects lessons, attendance, grades and remarks created via REST', async () => {
  const course = (await request(app).post('/api/courses').send({ name: 'Informatik 10' })).body;
  const student = (await request(app).post('/api/students').send({ firstName: 'Ben', lastName: 'Lorenz' })).body;
  await request(app).post(`/api/courses/${course.id}/students`).send({ studentId: student.id });

  const quarters = await request(app).get(`/api/courses/${course.id}/bundle`);
  const quarterId = quarters.body.quarters[0].id;

  const lesson = (
    await request(app).post(`/api/courses/${course.id}/lessons`).send({ quarterId, date: '2026-09-07', topic: 'Terme' })
  ).body;

  await request(app).put(`/api/lessons/${lesson.id}/attendance/${student.id}`).send({ status: 'verspaetet', lateMinutes: 5 });
  await request(app).put(`/api/lessons/${lesson.id}/grade/${student.id}`).send({ grade: '2+' });
  await request(app)
    .post('/api/remarks')
    .send({ targetType: 'lesson', targetId: lesson.id, studentId: student.id, emoji: '📕', text: 'Material vergessen' });

  const work = (
    await request(app)
      .post(`/api/courses/${course.id}/written-works`)
      .send({ quarterId, kind: 'test', title: 'Kurztest Terme', date: '2026-10-09' })
  ).body;
  await request(app).put(`/api/written-works/${work.id}/grade/${student.id}`).send({ grade: '1-' });

  const bundle = (await request(app).get(`/api/courses/${course.id}/bundle`)).body;
  expect(bundle.students).toHaveLength(1);
  expect(bundle.lessons[0].attendance[0]).toMatchObject({ status: 'verspaetet', late_minutes: 5 });
  expect(bundle.lessons[0].grades[0]).toMatchObject({ grade: '2+' });
  expect(bundle.lessons[0].remarks[0]).toMatchObject({ text: 'Material vergessen' });
  expect(bundle.writtenWorks[0].grades[0]).toMatchObject({ grade: '1-' });
});

test('rejects a written work with an invalid kind', async () => {
  const course = (await request(app).post('/api/courses').send({ name: 'Deutsch 7a' })).body;
  const bundle = (await request(app).get(`/api/courses/${course.id}/bundle`)).body;
  const quarterId = bundle.quarters[0].id;

  const res = await request(app)
    .post(`/api/courses/${course.id}/written-works`)
    .send({ quarterId, kind: 'nonsense', title: 'X', date: '2026-10-09' });
  expect(res.status).toBe(400);
});

test('rejects an incomplete student payload', async () => {
  const res = await request(app).post('/api/students').send({ firstName: 'Nur Vorname' });
  expect(res.status).toBe(400);
  expect(db.listStudents()).toHaveLength(0);
});
