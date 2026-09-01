require('dotenv').config();
const db = require('./db');
const { createServer } = require('./server');

const PORT = process.env.PORT || 4000;

async function main() {
  await db.init();
  const { httpServer } = createServer();
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ScoreSpace backend listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start ScoreSpace backend:', err);
  process.exit(1);
});
