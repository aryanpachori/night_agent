'use strict';

/** Rehydrate Date fields on position objects after JSON/DB round-trip. */
function rehydratePosition(p) {
  if (!p) return p;
  const o = { ...p };
  if (o.openedAt) o.openedAt = new Date(o.openedAt);
  if (o.closedAt != null) o.closedAt = new Date(o.closedAt);
  if (o.lastAlertAt != null) o.lastAlertAt = new Date(o.lastAlertAt);
  return o;
}

module.exports = { rehydratePosition };
