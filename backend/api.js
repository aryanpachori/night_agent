'use strict';

require('dotenv').config();

const { startApiServer } = require('./src/api/server');
const { disconnect } = require('./src/db/client');

let apiHttpServer = null;

async function main() {
  const jwtOk = process.env.JWT_SECRET && String(process.env.JWT_SECRET).length >= 16;
  if (!jwtOk) {
    console.error('[startup/api] JWT_SECRET missing or shorter than 16 chars.');
    process.exit(1);
  }

  apiHttpServer = await startApiServer();
  if (!apiHttpServer) {
    console.error('[startup/api] API server failed to start.');
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  (async () => {
    console.log('\n[shutdown/api] SIGINT received.');
    try {
      if (apiHttpServer && typeof apiHttpServer.close === 'function') {
        await new Promise(resolve => apiHttpServer.close(() => resolve()));
      }
      await disconnect();
    } catch (e) {
      console.error('[shutdown/api]', e.message);
    }
    process.exit(0);
  })();
});

process.on('uncaughtException', err => console.error(`[crash/api] Uncaught: ${err.message}`, err.stack));
process.on('unhandledRejection', r => console.error('[crash/api] Unhandled:', r));

main().catch(err => {
  console.error('[startup/api] Fatal:', err);
  process.exit(1);
});
