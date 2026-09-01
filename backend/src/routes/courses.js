const express = require('express');

function coursesRouter(db, notify) {
  const router = express.Router();

  const blockArchivedCourse = (courseId, res) => {
    if (db.isCourseInArchivedYear(Number(courseId))) {
      res.status(403).json({ error: 'Schuljahr ist archiviert (nur Export/Reaktivieren möglich).' });
      return true;
    }
    return false;
  };

  // ?yearId= -> only that year's courses; without it -> all courses.
  router.get('/courses', (req, res) => {
    const { yearId } = req.query;
    res.json(yearId ? db.listCoursesForYear(Number(yearId)) : db.listCourses());
  });

  router.post('/courses', (req, res) => {
    const { name, hoursPerWeek, yearId } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!yearId) return res.status(400).json({ error: 'yearId is required' });
    if (db.isYearArchived(Number(yearId))) {
      return res.status(403).json({ error: 'Schuljahr ist archiviert (nur Export/Reaktivieren möglich).' });
    }
    const course = db.createCourse({ name, hoursPerWeek, yearId: Number(yearId) });
    notify('courses');
    res.status(201).json(course);
  });

  router.patch('/courses/:id', (req, res) => {
    if (blockArchivedCourse(req.params.id, res)) return;
    const course = db.updateCourse(Number(req.params.id), req.body || {});
    if (!course) return res.status(404).json({ error: 'Course not found' });
    notify('courses', course.id);
    res.json(course);
  });

  router.delete('/courses/:id', (req, res) => {
    const id = Number(req.params.id);
    if (blockArchivedCourse(id, res)) return;
    db.deleteCourse(id);
    notify('courses', id);
    res.status(204).end();
  });

  router.get('/courses/:id/bundle', (req, res) => {
    const bundle = db.getCourseBundle(Number(req.params.id));
    if (!bundle) return res.status(404).json({ error: 'Course not found' });
    res.json(bundle);
  });

  router.post('/courses/:id/students', (req, res) => {
    const courseId = Number(req.params.id);
    if (blockArchivedCourse(courseId, res)) return;
    const { studentId } = req.body || {};
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });
    db.enrollStudent(courseId, Number(studentId));
    notify('courses', courseId);
    res.status(204).end();
  });

  router.delete('/courses/:id/students/:studentId', (req, res) => {
    const courseId = Number(req.params.id);
    if (blockArchivedCourse(courseId, res)) return;
    db.unenrollStudent(courseId, Number(req.params.studentId));
    notify('courses', courseId);
    res.status(204).end();
  });

  router.patch('/quarters/:id', (req, res) => {
    const quarter = db.updateQuarter(Number(req.params.id), req.body || {});
    if (!quarter) return res.status(404).json({ error: 'Quarter not found' });
    notify('courses', quarter.course_id);
    res.json(quarter);
  });

  router.patch('/halves/:id', (req, res) => {
    const half = db.updateHalf(Number(req.params.id), req.body || {});
    if (!half) return res.status(404).json({ error: 'Half not found' });
    notify('courses', half.course_id);
    res.json(half);
  });

  return router;
}

module.exports = coursesRouter;
