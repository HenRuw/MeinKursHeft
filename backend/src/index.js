// override: true so backend/.env is always authoritative, even if a process
// manager (pm2) injected its own cached copy of these vars at spawn time —
// otherwise a changed password in .env could be silently ignored.
require('dotenv').config({ override: true });
const db = require('./db');
const { createServer } = require('./server');

const PORT = process.env.PORT || 4000;

async function main() {
  // Build the server first: createAuth() validates the configuration and throws
  // (fails closed) on a missing password/secret BEFORE any database file is
  // opened or written, so a misconfiguration can never touch data on disk.
  const { app, httpServer } = createServer();

  // Open a database for each configured account (account 1 = the original file,
  // account 2 = its own independent file, created empty on first start).
  for (const id of app.locals.auth.accountIds) {
    await db.initAccount(id);
    console.log(`ScoreSpace: database ready for account ${id}`);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ScoreSpace backend listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start ScoreSpace backend:', err);
  process.exit(1);
});
