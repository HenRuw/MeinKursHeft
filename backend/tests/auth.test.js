const crypto = require('crypto');
const request = require('supertest');
const db = require('../src/db');
const { createServer } = require('../src/server');
const { signToken, verifyToken } = require('../src/auth');

const PASSWORD = 'correct-horse-battery';
const SECRET = 'test-secret-abc';

function makeHash(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

let app;

beforeEach(async () => {
  await db.init(':memory:');
  ({ app } = createServer({ enabled: true, passwordHash: makeHash(PASSWORD), secret: SECRET }));
});

afterEach(() => {
  db.close();
});

test('protected route rejects requests without a session cookie', async () => {
  const res = await request(app).get('/api/students');
  expect(res.status).toBe(401);
});

test('login with the wrong password is rejected', async () => {
  const res = await request(app).post('/api/login').send({ password: 'nope' });
  expect(res.status).toBe(401);
});

test('login with the correct password sets a session cookie that unlocks the API', async () => {
  const login = await request(app).post('/api/login').send({ password: PASSWORD });
  expect(login.status).toBe(200);
  expect(login.body).toEqual({ authenticated: true });
  const cookie = login.headers['set-cookie'];
  expect(cookie).toBeDefined();

  const ok = await request(app).get('/api/students').set('Cookie', cookie);
  expect(ok.status).toBe(200);
});

test('the session probe reports auth state', async () => {
  const anon = await request(app).get('/api/session');
  expect(anon.body).toEqual({ authenticated: false });

  const login = await request(app).post('/api/login').send({ password: PASSWORD });
  const probe = await request(app).get('/api/session').set('Cookie', login.headers['set-cookie']);
  expect(probe.body).toEqual({ authenticated: true });
});

test('logout clears the cookie', async () => {
  const login = await request(app).post('/api/login').send({ password: PASSWORD });
  const res = await request(app).post('/api/logout').set('Cookie', login.headers['set-cookie']);
  expect(res.status).toBe(200);
  // clearCookie sends a Set-Cookie that expires the value immediately.
  expect(res.headers['set-cookie'][0]).toMatch(/scorespace_session=;/);
});

test('a forged/expired token is not accepted', async () => {
  const wrongSig = await request(app)
    .get('/api/students')
    .set('Cookie', ['scorespace_session=tampered.value']);
  expect(wrongSig.status).toBe(401);

  const expired = signToken({ iat: Date.now() - 2000, exp: Date.now() - 1000 }, SECRET);
  const res = await request(app).get('/api/students').set('Cookie', [`scorespace_session=${expired}`]);
  expect(res.status).toBe(401);
});

test('createServer with auth enabled but no secret/hash throws (fails closed)', () => {
  expect(() => createServer({ enabled: true, passwordHash: '', secret: '' })).toThrow();
});

test('signToken/verifyToken round-trips and rejects a bad secret', () => {
  const token = signToken({ iat: Date.now(), exp: Date.now() + 10000 }, SECRET);
  expect(verifyToken(token, SECRET)).toMatchObject({ exp: expect.any(Number) });
  expect(verifyToken(token, 'other-secret')).toBeNull();
});
