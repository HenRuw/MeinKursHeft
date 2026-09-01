const express = require('express');

function studentsRouter(db, notify) {
  const router = express.Router();

  const blockArchived = (yearId, res) => {
    if (yearId != null && db.isYearArchived(Number(yearId))) {
      res.status(403).json({ error: 'Schuljahr ist archiviert (nur Export/Reaktivieren möglich).' });
      return true;
    }
    return false;
  };

  // With ?yearId= -> the students in that year (each carrying class_id +
  // klasse_name, class_id null = Ohne Klasse). Without it -> the whole person
  // pool, used by the "nirgends zugeordnet" cleanup and enrollment pickers.
  router.get('/students', (req, res) => {
    const { yearId } = req.query;
    res.json(yearId ? db.listStudentsForYear(Number(yearId)) : db.listAllStudents());
  });

  // Create a NEW person and place them in a year (class created on the fly).
  router.post('/students', (req, res) => {
    const { firstName, lastName, yearId, className } = req.body || {};
    if (!firstName || !lastName) return res.status(400).json({ error: 'firstName and lastName are required' });
    if (!yearId) return res.status(400).json({ error: 'yearId is required' });
    if (blockArchived(yearId, res)) return;
    const student = db.createStudentInYear({ firstName, lastName, yearId: Number(yearId), className });
    notify('students');
    res.status(201).json(student);
  });

  // Link an existing pool person into a year (import "same person" flow).
  router.post('/students/:id/link', (req, res) => {
    const { yearId, className, classId } = req.body || {};
    if (!yearId) return res.status(400).json({ error: 'yearId is required' });
    if (blockArchived(yearId, res)) return;
    db.addStudentToYear({ studentId: Number(req.params.id), yearId: Number(yearId), className, classId });
    notify('students');
    res.status(204).end();
  });

  // Rename the person (global) and/or move them within a year (needs yearId for
  // the class move).
  router.patch('/students/:id', (req, res) => {
    const { yearId } = req.body || {};
    if (blockArchived(yearId, res)) return;
    const student = db.updateStudentInYear(Number(req.params.id), yearId != null ? Number(yearId) : null, req.body || {});
    if (!student) return res.status(404).json({ error: 'Student not found' });
    notify('students');
    res.json(student);
  });

  // ?yearId= removes from that year only; ?global=1 deletes the person entirely
  // (only offered from the cleanup area).
  router.delete('/students/:id', (req, res) => {
    const id = Number(req.params.id);
    const { yearId, global } = req.query;
    if (global === '1') {
      db.deleteStudent(id);
    } else if (yearId) {
      if (blockArchived(yearId, res)) return;
      db.removeStudentFromYear(id, Number(yearId));
    } else {
      return res.status(400).json({ error: 'yearId (remove from year) or global=1 (delete person) is required' });
    }
    notify('students');
    res.status(204).end();
  });

  return router;
}

module.exports = studentsRouter;
