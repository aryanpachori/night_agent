'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

let _prisma = null;
let _pool = null;

function getPrisma() {
  if (!process.env.DATABASE_URL) return null;
  if (!_prisma) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(_pool);
    _prisma = new PrismaClient({ adapter });
  }
  return _prisma;
}

function isDbEnabled() {
  return !!process.env.DATABASE_URL;
}

async function disconnect() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

module.exports = { getPrisma, isDbEnabled, disconnect };
