'use strict';

const { PrismaClient } = require('@prisma/client');

let _prisma = null;

function getPrisma() {
  if (!process.env.DATABASE_URL) return null;
  if (!_prisma) {
    _prisma = new PrismaClient();
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
}

module.exports = { getPrisma, isDbEnabled, disconnect };
