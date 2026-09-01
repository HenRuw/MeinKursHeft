const crypto = require('crypto');
const request = require('supertest');
const ioClient = require('socket.io-client');
const db = require('../src/db');
const { createServer } = require('../src/server');
const { verifyToken, COOKIE_NAME } = require('../src/auth');

// Two accounts, two passwords, two fully independent databases behind one login.
const PW_A = 'password-account-a';
const PW_B = 'password-account-b';
const SECRET = 'test-secret-multi';

function makeHash(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

const AUTH = {
  enabled: true,
  secret: SECRET,
  accounts: [
    { id: '1', passwordHash: makeHash(PW_A) },
    { id: '2', passwordHash: makeHash(PW_B) },
  ],
};

let app;
let httpServer;
let port;
const openClients = [];

async function login(password) {
  const res = await request(app).post('/api/login').send({ password });
  return res;
}

function cookieValue(setCookie) {
  const line = setCookie.find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return line.split(';')[0].slice(`${COOKIE_NAME}=`.length);
}

beforeEach(async () => {
  // Both accounts get their own independent in-memory database.
  await db.initAccount('1', ':memory:');
  await db.initAccount('2', ':memory:');
  ({ app, httpServer } = createServer(AUTH));
  await new Promise((resolve) => {
    httpServer.listen(0, () => {
      port = httpServer.address().port;
      resolve();
    });
  });
});

afterEach(async () => {
  openClients.splice(0).forEach((c) => c.close());
  await new Promise((resolve) => httpServer.close(resolve));
  db.close();
});

test('each password logs into its own account and the token carries the account id', async () => {
  const a = await login(PW_A);
  const b = await login(PW_B);
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);

  const tokenA = verifyToken(cookieValue(a.headers['set-cookie']), SECRET);
  const tokenB = verifyToken(cookieValue(b.headers['set-cookie']), SECRET);
  expect(tokenA.account).toBe('1');
  expect(tokenB.account).toBe('2');
});

test('a wrong password matches no account', async () => {
  const res = await login('neither-of-them');
  expect(res.status).toBe(401);
});

test("student data created by account A is invisible to account B and vice versa", async () => {
  const cookieA = (await login(PW_A)).headers['set-cookie'];
  const cookieB = (await login(PW_B)).headers['set-cookie'];

  // A creates a student.
  const created = await request(app).post('/api/students').set('Cookie', cookieA).send({ firstName: 'Anna', lastName: 'Alpha' });
  expect(created.status).toBe(201);

  // B sees an empty roster and creates a different student.
  const bList = await request(app).get('/api/students').set('Cookie', cookieB);
  expect(bList.status).toBe(200);
  expect(bList.body).toHaveLength(0);
  await request(app).post('/api/students').set('Cookie', cookieB).send({ firstName: 'Bruno', lastName: 'Beta' });

  // A still sees only its own student; B only its own.
  const aList = await request(app).get('/api/students').set('Cookie', cookieA);
  expect(aList.body).toHaveLength(1);
  expect(aList.body[0]).toMatchObject({ first_name: 'Anna', last_name: 'Alpha' });

  const bList2 = await request(app).get('/api/students').set('Cookie', cookieB);
  expect(bList2.body).toHaveLength(1);
  expect(bList2.body[0]).toMatchObject({ first_name: 'Bruno', last_name: 'Beta' });

  // And the underlying databases are genuinely separate.
  expect(db.runWithAccount('1', () => db.listStudents())).toHaveLength(1);
  expect(db.runWithAccount('2', () => db.listStudents())).toHaveLength(1);
});

test('a live-sync event for one account never reaches the other account', (done) => {
  Promise.all([login(PW_A), login(PW_B)]).then(([a, b]) => {
    const cookieA = cookieValue(a.headers['set-cookie']);
    const cookieB = cookieValue(b.headers['set-cookie']);

    const clientA = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Cookie: `${COOKIE_NAME}=${cookieA}` },
    });
    const clientB = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Cookie: `${COOKIE_NAME}=${cookieB}` },
    });
    openClients.push(clientA, clientB);

    let bGotForeignEvent = false;
    clientB.on('sync:changed', (payload) => {
      // B's own connect emits the generic 'init'; anything else would be A's leak.
      if (payload.resource !== 'init') bGotForeignEvent = true;
    });

    let aReady = false;
    let bReady = false;
    const maybeMutate = () => {
      if (!aReady || !bReady) return;
      // A mutates; only A should be told.
      clientA.on('sync:changed', (payload) => {
        if (payload.resource === 'students') {
          // Give any (incorrect) broadcast to B a tick to arrive, then assert.
          setTimeout(() => {
            expect(bGotForeignEvent).toBe(false);
            done();
          }, 150);
        }
      });
      request(app).post('/api/students').set('Cookie', a.headers['set-cookie']).send({ firstName: 'Cara', lastName: 'Gamma' }).end(() => {});
    };
    clientA.on('connect', () => { aReady = true; maybeMutate(); });
    clientB.on('connect', () => { bReady = true; maybeMutate(); });
  });
});
