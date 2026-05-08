#!/usr/bin/env node
'use strict';

async function main() {
  const base = process.env.API_BASE_URL || 'http://localhost:3000';
  const token = process.env.NIGHTAGENT_TOKEN || '';
  if (!token) {
    throw new Error('Set NIGHTAGENT_TOKEN to run contract smoke checks.');
  }

  const headers = { Authorization: `Bearer ${token}` };
  const checks = [
    ['/api/stats/summary', ['balance', 'totalPnl', 'roi', 'alertsTodayCount']],
    ['/api/stats/bot-status', ['isActive', 'isPaused', 'lastScanAt', 'scanIntervalSeconds']],
    ['/api/alerts?type=pending&limit=5', ['alerts', 'total']],
    ['/api/positions?status=open&limit=5', ['positions', 'total']],
  ];

  for (const [path, keys] of checks) {
    const res = await fetch(`${base}${path}`, { headers });
    if (!res.ok) throw new Error(`Contract check failed ${path}: HTTP ${res.status}`);
    const body = await res.json();
    const missing = keys.filter((k) => !(k in body));
    if (missing.length) throw new Error(`Contract check failed ${path}: missing keys ${missing.join(', ')}`);
    console.log(`[contract] ok ${path}`);
  }
}

main().catch((err) => {
  console.error('[contract] failed', err.message);
  process.exit(1);
});
