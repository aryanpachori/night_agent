'use strict';

const { getPrisma } = require('../../db/client');

/** Ensures PostgreSQL is configured and attaches shared Prisma client to `req.prisma`. */
function requireDb(req, res, next) {
  const p = getPrisma();
  if (!p) return res.status(503).json({ error: 'Database not configured' });
  req.prisma = p;
  next();
}

module.exports = { requireDb };
