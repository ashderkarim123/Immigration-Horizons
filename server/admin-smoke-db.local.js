/**
 * Boots a disposable in-memory MongoDB for an admin-UI smoke test and
 * stays alive. Never reads the real MONGODB_URI.
 * Run from the `server/` directory.
 */
const fs = require('node:fs');
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const server = await MongoMemoryServer.create();
  const uri = server.getUri('admin-smoke');
  fs.writeFileSync(process.argv[2], JSON.stringify({ uri }, null, 2));
  console.log('[admin-smoke-db] ready');
  setInterval(() => {}, 1 << 30);
})();
