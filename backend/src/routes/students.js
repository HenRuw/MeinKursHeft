const express = require('express');

function studentsRouter(db, notify) {
  const router = express.Router();

  router.get('/students', (req, res) => {
    res.json(db.listStudents());
  });

  router.post('/students', (req, res) => {
    const { firstName, lastName, klasseId } = req.body || {};
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required' });
    }
    const student = db.createStudent({ firstName, lastName, klasseId });
    notify('students');
    res.status(201).json(student);
  });

  router.patch('/students/:id', (req, res) => {
    const student = db.updateStudent(Number(req.params.id), req.body || {});
    if (!student) return res.status(404).json({ error: 'Student not found' });
    notify('students');
    res.json(student);
  });

  router.delete('/students/:id', (req, res) => {
    db.deleteStudent(Number(req.params.id));
    notify('students');
    res.status(204).end();
  });

  return router;
}

module.exports = studentsRouter;
