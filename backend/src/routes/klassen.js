const express = require('express');

function klassenRouter(db, notify) {
  const router = express.Router();

  router.get('/klassen', (req, res) => {
    res.json(db.listKlassen());
  });

  router.post('/klassen', (req, res) => {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const klasse = db.createKlasse({ name });
    notify('klassen');
    res.status(201).json(klasse);
  });

  return router;
}

module.exports = klassenRouter;
