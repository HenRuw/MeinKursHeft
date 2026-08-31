const express = require('express');

const KINDS = ['klassenarbeit', 'test', 'sonstige'];

function writtenWorksRouter(db, notify) {
  const router = express.Router();

  router.get('/courses/:id/written-works', (req, res) => {
    res.json(db.listWrittenWorks(Number(req.params.id)));
  });

  router.post('/courses/:id/written-works', (req, res) => {
    const courseId = Number(req.params.id);
    const { quarterId, kind, title, content, date, weight } = req.body || {};
    if (!quarterId || !title || !date) {
      return res.status(400).json({ error: 'quarterId, title and date are required' });
    }
    if (kind && !KINDS.includes(kind)) return res.status(400).json({ error: 'invalid kind' });
    const work = db.createWrittenWork({ courseId, quarterId, kind: kind || 'klassenarbeit', title, content, date, weight });
    notify('courses', courseId);
    res.status(201).json(work);
  });

  router.patch('/written-works/:id', (req, res) => {
    if (req.body && req.body.kind && !KINDS.includes(req.body.kind)) {
      return res.status(400).json({ error: 'invalid kind' });
    }
    const work = db.updateWrittenWork(Number(req.params.id), req.body || {});
    if (!work) return res.status(404).json({ error: 'Written work not found' });
    notify('courses', work.course_id);
    res.json(work);
  });

  router.delete('/written-works/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.getWrittenWork(id);
    db.deleteWrittenWork(id);
    if (existing) notify('courses', existing.course_id);
    res.status(204).end();
  });

  router.put('/written-works/:id/grade/:studentId', (req, res) => {
    const workId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    const { grade } = req.body || {};
    const record = db.setWrittenWorkGrade(workId, studentId, grade === undefined ? null : grade);
    const work = db.getWrittenWork(workId);
    if (work) notify('courses', work.course_id);
    res.json(record);
  });

  router.put('/written-works/:id/grade/:studentId/lock', (req, res) => {
    const workId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    const { locked } = req.body || {};
    const record = db.setWrittenWorkGradeLock(workId, studentId, !!locked);
    const work = db.getWrittenWork(workId);
    if (work) notify('courses', work.course_id);
    res.json(record);
  });

  return router;
}

module.exports = writtenWorksRouter;
