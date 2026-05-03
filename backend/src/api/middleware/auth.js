'use strict';

const { jwtVerify } = require('jose');

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  return s ? new TextEncoder().encode(s) : null;
}

async function requireAuth(req, res, next) {
  try {
    const secret = getJwtSecret();
    if (!secret) return res.status(500).json({ error: 'Server missing JWT_SECRET' });

    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie;

    let token = null;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (cookieHeader) {
      const match = cookieHeader.match(/nightagent_token=([^;]+)/);
      if (match) token = decodeURIComponent(match[1].trim());
    } else if (req.query?.token) {
      // Fallback for EventSource (SSE) which cannot set Authorization headers
      token = String(req.query.token);
    }

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { payload } = await jwtVerify(token, secret);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth, getJwtSecret };
