const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const db = require('./db');
const studentsRouter = require('./routes/students');
const klassenRouter = require('./routes/klassen');
const coursesRouter = require('./routes/courses');
const lessonsRouter = require('./routes/lessons');
const writtenWorksRouter = require('./routes/writtenWorks');
const remarksRouter = require('./routes/remarks');

function createApp(notify) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api', studentsRouter(db, notify));
  app.use('/api', klassenRouter(db, notify));
  app.use('/api', coursesRouter(db, notify));
  app.use('/api', lessonsRouter(db, notify));
  app.use('/api', writtenWorksRouter(db, notify));
  app.use('/api', remarksRouter(db, notify));

  return app;
}

function createServer() {
  let io;
  const notify = (resource, courseId) => {
    if (io) io.emit('sync:changed', { resource, courseId: courseId ?? null });
  };

  const app = createApp(notify);
  const httpServer = http.createServer(app);
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    socket.emit('sync:changed', { resource: 'init', courseId: null });
  });

  return { app, httpServer, io };
}

module.exports = { createApp, createServer };
