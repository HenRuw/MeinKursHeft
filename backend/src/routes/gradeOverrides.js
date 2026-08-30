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

  return router;
}

module.exports = gradeOverridesRouter;
