'use strict';

/**
 * In-process SSE client registry.
 * Maps userId -> Set<express.Response> for connected browser clients.
 */
const clients = new Map(); // userId -> Set<res>

function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
}

function removeClient(userId, res) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

/**
 * Push a named SSE event with JSON data to all connected clients for a user.
 */
function emitToUser(userId, eventName, data) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      set.delete(res);
    }
  }
}

module.exports = { addClient, removeClient, emitToUser };
