'use strict';

/**
 * Prisma accessor for API routes — delegates to the shared singleton in src/db/client.js
 * (Prisma 7 + pg adapter). Throws if DATABASE_URL is not configured.
 */
const db = require('../db/client');

module.exports = {
  get prisma() {
    const client = db.getPrisma();
    if (!client) {
      throw new Error('[auth-api] DATABASE_URL must be set for Prisma');
    }
    return client;
  },
};
