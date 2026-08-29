const express = require('express');

function courseIdForTarget(db, targetType, targetId) {
  if (targetType === 'lesson') {
    const lesson = db.getLesson(targetId);
    return lesson ? lesson.course_id : null;
  }
  if (targetType === 'written_work') {
    const work = db.getWrittenWork(targetId);
    return work ? work.course_id : null;
  }
  return null;
}

function remarksRouter(db, notify) {
  const router = express.Router();

  router.post('/remarks', (req, res) => {
    const { targetType, targetId, studentId, emoji, text } = req.body || {};
    if (!['lesson', 'written_work'].includes(targetType) || !targetId || !studentId || !text) {
      return res.status(400).json({ error: 'targetType, targetId, studentId and text are required' });
    }
    const remark = db.createRemark({ targetType, targetId: Number(targetId), studentId: Number(studentId), emoji, text });
    const courseId = courseIdForTarget(db, targetType, Number(targetId));
    if (courseId) notify('courses', courseId);
    res.status(201).json(remark);
  });

  router.patch('/remarks/:id', (req, res) => {
    const remark = db.updateRemark(Number(req.params.id), req.body || {});
    if (!remark) return res.status(404).json({ error: 'Remark not found' });
    const courseId = courseIdForTarget(db, remark.target_type, remark.target_id);
    if (courseId) notify('courses', courseId);
    res.json(remark);
  });

  router.delete('/remarks/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.getRemark(id);
    db.deleteRemark(id);
    if (existing) {
      const courseId = courseIdForTarget(db, existing.target_type, existing.target_id);
      if (courseId) notify('courses', courseId);
    }
    res.status(204).end();
  });

  router.get('/remark-presets', (req, res) => {
    res.json(db.listRemarkPresets());
  });

  router.post('/remark-presets', (req, res) => {
    const { emoji, text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text is required' });
    const preset = db.createRemarkPreset({ emoji, text });
    notify('remark-presets');
    res.status(201).json(preset);
  });

  router.delete('/remark-presets/:id', (req, res) => {
    db.deleteRemarkPreset(Number(req.params.id));
    notify('remark-presets');
    res.status(204).end();
  });

  return router;
}

module.exports = remarksRouter;
