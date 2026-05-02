'use strict';

/** Timestamps of opportunity alerts sent (rolling 1h window) */
const _hourlyAlertTs = [];

/**
 * @returns {boolean} false when MAX_OPPORTUNITY_ALERTS_PER_HOUR would be exceeded
 */
function canSendOpportunityAlert() {
  const n = parseInt(process.env.MAX_OPPORTUNITY_ALERTS_PER_HOUR, 10);
  if (!Number.isFinite(n) || n <= 0) return true;
  const t1 = Date.now() - 3_600_000;
  while (_hourlyAlertTs.length && _hourlyAlertTs[0] < t1) _hourlyAlertTs.shift();
  return _hourlyAlertTs.length < n;
}

function recordOpportunityAlert() {
  _hourlyAlertTs.push(Date.now());
}

module.exports = { canSendOpportunityAlert, recordOpportunityAlert };
