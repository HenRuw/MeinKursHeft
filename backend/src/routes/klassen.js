const express = require('express');

function klassenRouter(db, notify) {
  const router = express.Router();

  router.get('/klassen', (req, res) => {
    res.json(db.listKlassen());
  });

  router.post('/klassen', (req, res) => {
    const { name, jahrgang } = req.body || {};
    if (!name || !jahrgang) return res.status(400).json({ error: 'name and jahrgang are required' });
    const klasse = db.createKlasse({ name, jahrgang: Number(jahrgang) });
    notify('klassen');
    res.status(201).json(klasse);
  });

  return router;
}

module.exports = klassenRouter;
