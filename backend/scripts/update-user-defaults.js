'use strict';
require('dotenv').config();
const { getPrisma, disconnect } = require('../src/db/client');

async function main() {
  const db = getPrisma();
  if (!db) { console.error('No DATABASE_URL'); process.exit(1); }
  const result = await db.user.updateMany({
    data: { maxAlertsPerDay: 10, alertIntervalMin: 5 },
  });
  console.log(`Updated ${result.count} user(s) to maxAlertsPerDay=10, alertIntervalMin=5`);
}

main().catch(console.error).finally(() => disconnect());
