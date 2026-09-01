const express = require('express');

// Full-database backup: download a JSON snapshot of everything, or restore
// one. Restore replaces the entire database contents, so it notifies every
// resource afterwards to make connected clients refetch.
function backupRouter(db, notify) {
  const router = express.Router();

  router.get('/backup', (req, res) => {
    res.json(db.exportAll());
  });

  router.post('/backup/restore', (req, res) => {
    const payload = req.body;
    // Accept the current name and the previous "scorespace" one, so backups
    // exported before the rename still restore.
    if (!payload || (payload.app !== 'meinkursheft' && payload.app !== 'scorespace') || !payload.tables) {
      return res.status(400).json({ error: 'Keine gültige MeinKursHeft-Backupdatei.' });
    }
    try {
      db.importAll(payload);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Wiederherstellung fehlgeschlagen.' });
    }
    notify('backup');
    res.json({ status: 'ok' });
  });

  return router;
}

module.exports = backupRouter;
