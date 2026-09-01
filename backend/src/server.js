const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const db = require('./db');
const { createAuth } = require('./auth');
const studentsRouter = require('./routes/students');
const klassenRouter = require('./routes/klassen');
const schoolYearsRouter = require('./routes/schoolYears');
const coursesRouter = require('./routes/courses');
const lessonsRouter = require('./routes/lessons');
const writtenWorksRouter = require('./routes/writtenWorks');
const remarksRouter = require('./routes/remarks');
const gradeOverridesRouter = require('./routes/gradeOverrides');
const backupRouter = require('./routes/backup');

// Browsers only send/accept the session cookie when the responding origin is
// explicitly allowed *and* credentials are enabled — a wildcard is not valid
// with credentials. In production the app is same-origin behind nginx; the
// localhost entries cover local dev where the Vite server and the API differ
// by port. Override with ALLOWED_ORIGINS (comma-separated) if needed.
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'https://meinkursheft.duckdns.org,http://localhost:5173,http://localhost:4173,http://localhost:3000'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function corsOrigin(origin, callback) {
  // No Origin header = same-origin navigation or a non-browser client (curl,
  // health checks) — nothing for CORS to protect against, so allow it.
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
  return callback(new Error(`Origin ${origin} nicht erlaubt`));
}

function createApp(notify, authOptions) {
  const app = express();
  // Behind the nginx TLS terminator: trust X-Forwarded-Proto so req.secure is
  // true on HTTPS and the session cookie gets the Secure flag in production.
  app.set('trust proxy', 1);

  const auth = createAuth(authOptions);
  app.locals.auth = auth; // createServer reuses it for the socket guard

  app.use(cors({ origin: corsOrigin, credentials: true }));
  // Generous limit: a restore posts the whole database as JSON.
  app.use(express.json({ limit: '64mb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Public auth endpoints (login / logout / session probe).
  app.use('/api', auth.router);

  // Everything below this line requires a valid session cookie.
  app.use('/api', auth.requireAuth);

  // Bind the rest of the request to the authenticated account, so every db.*
  // call in the handlers below — and the synchronous notify() they trigger —
  // transparently hits that account's database. Handlers are untouched.
  app.use('/api', (req, res, next) => db.runWithAccount(req.account, next));

  app.use('/api', schoolYearsRouter(db, notify));
  app.use('/api', studentsRouter(db, notify));
  app.use('/api', klassenRouter(db, notify));
  app.use('/api', coursesRouter(db, notify));
  app.use('/api', lessonsRouter(db, notify));
  app.use('/api', writtenWorksRouter(db, notify));
  app.use('/api', remarksRouter(db, notify));
  app.use('/api', gradeOverridesRouter(db, notify));
  app.use('/api', backupRouter(db, notify));

  return app;
}

function createServer(authOptions) {
  let io;
  const notify = (resource, courseId) => {
    if (!io) return;
    // notify() is called synchronously inside a request handler, so it still
    // sees that request's account context — scope the broadcast to that
    // account's room so one user's change never reaches the other's screens.
    const accountId = db.currentAccountId();
    io.to(`acct:${accountId}`).emit('sync:changed', { resource, courseId: courseId ?? null });
  };

  const app = createApp(notify, authOptions);
  const httpServer = http.createServer(app);
  io = new Server(httpServer, { cors: { origin: ALLOWED_ORIGINS, credentials: true } });

  // Refuse WebSocket connections that don't carry a valid session cookie, so
  // the live-sync channel can't be used to bypass the REST auth.
  io.use(app.locals.auth.socketMiddleware);

  io.on('connection', (socket) => {
    // socketMiddleware validated the cookie and stamped the account id; join
    // that account's room so this client only receives its own sync events.
    const accountId = socket.data.accountId || db.DEFAULT_ACCOUNT_ID;
    socket.join(`acct:${accountId}`);
    socket.emit('sync:changed', { resource: 'init', courseId: null });
  });

  return { app, httpServer, io };
}

module.exports = { createApp, createServer };
