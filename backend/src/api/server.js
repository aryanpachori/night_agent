'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const walletRoutes = require('./routes/wallet');
const positionsRoutes = require('./routes/positions');
const alertsRoutes = require('./routes/alerts');
const marketsRoutes = require('./routes/markets');
const statsRoutes = require('./routes/stats');

function corsOrigins() {
  const origins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  if (process.env.FRONTEND_URL) origins.push(process.env.FRONTEND_URL.replace(/\/$/, ''));
  return [...new Set(origins)];
}

function createApiServer() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests' },
    }),
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/positions', positionsRoutes);
  app.use('/api/alerts', alertsRoutes);
  app.use('/api/markets', marketsRoutes);
  app.use('/api/stats', statsRoutes);

  app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err, req, res, next) => {
    void next;
    console.error('[API Error]', err);
    const status = err.statusCode || err.status || 500;
    const msg = status === 503 ? err.message || 'Service unavailable' : 'Internal server error';
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: status === 500 ? 'Internal server error' : msg,
    });
  });

  return app;
}

async function startApiServer() {
  const jwtOk = process.env.JWT_SECRET && String(process.env.JWT_SECRET).length >= 16;
  if (!jwtOk) {
    console.warn('[api] JWT_SECRET missing or shorter than 16 chars — API server not started');
    return null;
  }

  const app = createApiServer();
  const port = Number(process.env.API_PORT) || 4000;
  /** Default `0.0.0.0` so `http://127.0.0.1:PORT` and `http://localhost:PORT` both work reliably on Windows. */
  const host = process.env.API_HOST || '0.0.0.0';

  return new Promise(resolve => {
    const server = app.listen(port, host, () => {
      console.log(`[api] REST API listening on http://${host}:${port}`);
      resolve(server);
    });
  });
}

module.exports = { createApiServer, startApiServer };
