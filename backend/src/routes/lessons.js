const express = require('express');

function lessonsRouter(db, notify) {
  const router = express.Router();

  router.get('/courses/:id/lessons', (req, res) => {
    res.json(db.listLessons(Number(req.params.id)));
  });

  router.post('/courses/:id/lessons', (req, res) => {
    const courseId = Number(req.params.id);
    const { quarterId, date, durationHours, topic, content, note } = req.body || {};
    if (!quarterId || !date) return res.status(400).json({ error: 'quarterId and date are required' });
    const lesson = db.createLesson({ courseId, quarterId, date, durationHours, topic, content, note });
    notify('courses', courseId);
    res.status(201).json(lesson);
  });

  router.patch('/lessons/:id', (req, res) => {
    const lesson = db.updateLesson(Number(req.params.id), req.body || {});
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    notify('courses', lesson.course_id);
    res.json(lesson);
  });

  router.delete('/lessons/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.getLesson(id);
    db.deleteLesson(id);
    if (existing) notify('courses', existing.course_id);
    res.status(204).end();
  });

  router.put('/lessons/:id/attendance/:studentId', (req, res) => {
    const lessonId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    const { status, lateMinutes, excused } = req.body || {};
    const record = db.setAttendance(lessonId, studentId, { status, lateMinutes, excused });
    const lesson = db.getLesson(lessonId);
    if (lesson) notify('courses', lesson.course_id);
    res.json(record);
  });

  router.put('/lessons/:id/grade/:studentId', (req, res) => {
    const lessonId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    const { grade } = req.body || {};
    const record = db.setParticipationGrade(lessonId, studentId, grade === undefined ? null : grade);
    const lesson = db.getLesson(lessonId);
    if (lesson) notify('courses', lesson.course_id);
    res.json(record);
  });

  router.put('/lessons/:id/grade/:studentId/lock', (req, res) => {
    const lessonId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    const { locked } = req.body || {};
    const record = db.setParticipationGradeLock(lessonId, studentId, !!locked);
    const lesson = db.getLesson(lessonId);
    if (lesson) notify('courses', lesson.course_id);
    res.json(record);
  });

  return router;
}

module.exports = lessonsRouter;
