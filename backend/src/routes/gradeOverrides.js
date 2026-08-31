const express = require('express');

function gradeOverridesRouter(db, notify) {
  const router = express.Router();

  // A single PUT covers both directions: a non-empty grade upserts the
  // override, an empty one deletes it — that's "reset to the calculated
  // value" from the caller's point of view, so it doesn't need its own route.
  router.put('/courses/:id/grade-overrides', (req, res) => {
    const courseId = Number(req.params.id);
    const { studentId, kind, refId, grade } = req.body || {};
    if (!studentId || !kind || refId == null) {
      return res.status(400).json({ error: 'studentId, kind and refId are required' });
    }
    if (grade) {
      const override = db.setGradeOverride({ courseId, studentId: Number(studentId), kind, refId: Number(refId), grade });
      notify('courses', courseId);
      return res.json(override);
    }
    db.deleteGradeOverride({ courseId, studentId: Number(studentId), kind, refId: Number(refId) });
    notify('courses', courseId);
    res.status(204).end();
  });

  // Locks/unlocks a single average cell (its presence in average_locks is the
  // lock). While locked, the grade-override PUT above is a no-op server-side.
  router.put('/courses/:id/average-locks', (req, res) => {
    const courseId = Number(req.params.id);
    const { studentId, kind, refId, locked } = req.body || {};
    if (!studentId || !kind || refId == null) {
      return res.status(400).json({ error: 'studentId, kind and refId are required' });
    }
    const record = db.setAverageLock({ courseId, studentId: Number(studentId), kind, refId: Number(refId), locked: !!locked });
    notify('courses', courseId);
    res.json(record);
  });

  // Locks/unlocks a whole average column (every enrolled student's cell of the
  // given kind + ref_id) in one call -- used by the Notenübersicht lock row.
  router.put('/courses/:id/average-lock-columns', (req, res) => {
    const courseId = Number(req.params.id);
    const { kind, refId, locked } = req.body || {};
    if (!kind || refId == null) {
      return res.status(400).json({ error: 'kind and refId are required' });
    }
    const record = db.setAverageLockColumn({ courseId, kind, refId: Number(refId), locked: !!locked });
    notify('courses', courseId);
    res.json(record);
  });

  return router;
}

module.exports = gradeOverridesRouter;
