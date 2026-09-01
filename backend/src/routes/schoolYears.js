const express = require('express');

// Schuljahre: school years plus everything scoped to a year (classes, the
// quarter calendar, year rollover) and the pool-wide helpers the import and
// cleanup screens need. Thin wrappers over the (tested) db layer.
function schoolYearsRouter(db, notify) {
  const router = express.Router();

  // Rejects writes to an archived year (export/unarchive stay allowed). Returns
  // true when it has already sent a 403, so callers just `return`.
  const blockArchived = (yearId, res) => {
    if (db.isYearArchived(Number(yearId))) {
      res.status(403).json({ error: 'Schuljahr ist archiviert (nur Export/Reaktivieren möglich).' });
      return true;
    }
    return false;
  };

  // ---- year context (what the UI opens on) ----
  router.get('/year-context', (req, res) => {
    res.json({ years: db.listSchoolYears(), currentYearId: db.getUiLastYearId() });
  });

  router.put('/year-context', (req, res) => {
    const { yearId } = req.body || {};
    if (!db.getSchoolYear(Number(yearId))) return res.status(404).json({ error: 'Schuljahr nicht gefunden' });
    db.setUiLastYearId(Number(yearId));
    res.json({ currentYearId: Number(yearId) });
  });

  // ---- school years ----
  router.get('/years', (req, res) => res.json(db.listSchoolYears()));

  router.post('/years', (req, res) => {
    const { label, copyQuartersFromYearId } = req.body || {};
    if (!label || !label.trim()) return res.status(400).json({ error: 'label is required' });
    const year = db.createSchoolYear({ label: label.trim(), copyQuartersFromYearId });
    notify('years');
    res.status(201).json(year);
  });

  router.patch('/years/:id', (req, res) => {
    const id = Number(req.params.id);
    const cur = db.getSchoolYear(id);
    if (!cur) return res.status(404).json({ error: 'Schuljahr nicht gefunden' });
    const { label, archived } = req.body || {};
    let year = cur;
    if (label !== undefined) year = db.renameSchoolYear(id, String(label).trim());
    if (archived !== undefined) year = db.setSchoolYearArchived(id, archived ? 1 : 0);
    notify('years');
    res.json(year);
  });

  // Hard delete, gated on retyping the exact label so it can't happen by accident.
  router.delete('/years/:id', (req, res) => {
    const id = Number(req.params.id);
    const year = db.getSchoolYear(id);
    if (!year) return res.status(404).json({ error: 'Schuljahr nicht gefunden' });
    const confirmLabel = (req.body && req.body.confirmLabel) || req.query.confirmLabel;
    if (confirmLabel !== year.label) {
      return res.status(400).json({ error: 'Zur Bestätigung bitte das Schuljahr-Label exakt eingeben.' });
    }
    db.deleteSchoolYear(id);
    notify('years');
    res.status(204).end();
  });

  // ---- quarter calendar (per year) ----
  router.get('/years/:id/quarters', (req, res) => res.json(db.getYearQuarters(Number(req.params.id))));

  router.put('/years/:id/quarters', (req, res) => {
    const id = Number(req.params.id);
    if (!db.getSchoolYear(id)) return res.status(404).json({ error: 'Schuljahr nicht gefunden' });
    if (blockArchived(id, res)) return;
    const ranges = (req.body && req.body.ranges) || [];
    if (!Array.isArray(ranges) || !ranges.length) return res.status(400).json({ error: 'ranges is required' });
    const quarters = db.setYearQuarters(id, ranges);
    // Quarter dates feed every course in the year, so nudge course consumers too.
    notify('years');
    notify('courses');
    res.json(quarters);
  });

  // ---- classes (year-scoped) ----
  router.get('/years/:id/classes', (req, res) => res.json(db.listClasses(Number(req.params.id))));

  router.post('/years/:id/classes', (req, res) => {
    const id = Number(req.params.id);
    if (!db.getSchoolYear(id)) return res.status(404).json({ error: 'Schuljahr nicht gefunden' });
    if (blockArchived(id, res)) return;
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const klasse = db.createClass({ yearId: id, name: name.trim() });
    notify('classes');
    res.status(201).json(klasse);
  });

  router.patch('/classes/:id', (req, res) => {
    const id = Number(req.params.id);
    const cur = db.getClass(id);
    if (!cur) return res.status(404).json({ error: 'Klasse nicht gefunden' });
    if (blockArchived(cur.year_id, res)) return;
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const klasse = db.renameClass(id, name.trim());
    notify('classes');
    notify('students');
    res.json(klasse);
  });

  router.delete('/classes/:id', (req, res) => {
    const id = Number(req.params.id);
    const cur = db.getClass(id);
    if (!cur) return res.status(404).json({ error: 'Klasse nicht gefunden' });
    if (blockArchived(cur.year_id, res)) return;
    db.deleteClass(id);
    notify('classes');
    notify('students');
    res.status(204).end();
  });

  // ---- year rollover ("Neues Schuljahr") ----
  // Creates the target year, advances the listed classes (same identities under
  // new names) and copies the listed courses (name + roster snapshot).
  router.post('/years/advance', (req, res) => {
    const { toLabel, fromYearId, classes = [], courses, courseIds = [] } = req.body || {};
    if (!toLabel || !toLabel.trim()) return res.status(400).json({ error: 'toLabel is required' });
    // A new year never inherits the old year's quarter calendar: it starts
    // with no quarters, so the Notenübersicht guides the user to set them up
    // first (see the QuartalEditor hint).
    const toYear = db.createSchoolYear({ label: toLabel.trim() });
    for (const c of classes) {
      if (c && c.fromClassId && c.newName && c.newName.trim()) {
        db.carryClassToYear({ fromClassId: Number(c.fromClassId), toYearId: toYear.id, newName: c.newName.trim() });
      }
    }
    // Courses can now carry a new name too (like classes). Fall back to the
    // legacy courseIds shape (copy under the same name) when `courses` is absent.
    const courseRows = Array.isArray(courses)
      ? courses.filter((c) => c && c.courseId)
      : courseIds.map((id) => ({ courseId: id }));
    for (const c of courseRows) {
      db.carryCourseToYear({ courseId: Number(c.courseId), toYearId: toYear.id, newName: c.newName });
    }
    db.setUiLastYearId(toYear.id);
    notify('years');
    notify('classes');
    notify('students');
    notify('courses');
    res.status(201).json(toYear);
  });

  // ---- pool-wide helpers (import matching + cleanup) ----
  // Given [{ firstName, lastName }], returns the pool matches per row so the
  // import can ask "same person as in year X?" before linking or creating.
  router.post('/students/match', (req, res) => {
    const names = (req.body && req.body.names) || [];
    if (!Array.isArray(names)) return res.status(400).json({ error: 'names must be an array' });
    res.json(names.map((n) => ({
      firstName: n.firstName,
      lastName: n.lastName,
      matches: (n.firstName && n.lastName) ? db.findStudentsByName(n.firstName, n.lastName) : [],
    })));
  });

  router.get('/students/unassigned', (req, res) => res.json(db.listUnassignedStudents()));

  return router;
}

module.exports = schoolYearsRouter;
