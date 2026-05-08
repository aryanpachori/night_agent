'use strict';

const GATEWAY_BASE = 'https://gatewayapi.telegram.org';

function getGatewayToken() {
  const token = process.env.TELEGRAM_API_ID;
  if (!token) throw new Error('TELEGRAM_API_ID (Gateway token) not set in .env');
  return token;
}

async function sendVerificationCode(phone) {
  const res = await fetch(`${GATEWAY_BASE}/sendVerificationMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getGatewayToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone_number: phone,
      code_length: 6,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error('[gateway] sendVerificationMessage failed:', data);
    const msg = data.error ?? 'Failed to send verification code';
    if (msg.includes('PHONE_NUMBER_INVALID')) throw new Error('Invalid phone number format');
    if (msg.includes('FLOOD_WAIT')) throw new Error('Too many attempts. Please wait a few minutes.');
    if (msg.includes('not a Telegram user')) throw new Error('This number is not registered on Telegram.');
    throw new Error(msg);
  }

  const requestId = data.result?.request_id;
  if (!requestId) throw new Error('No request_id returned from Gateway API');
  return { requestId };
}

async function checkVerificationCode(requestId, code) {
  const res = await fetch(`${GATEWAY_BASE}/checkVerificationStatus`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getGatewayToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request_id: requestId,
      code: String(code).trim(),
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error('[gateway] checkVerificationStatus failed:', data);
    throw new Error(data.error ?? 'Verification request failed');
  }

  const result = data.result;
  const status = result?.verification_status?.status;
  if (status === 'code_invalid') throw new Error('Invalid code. Please check and try again.');
  if (status === 'code_expired') throw new Error('Code expired. Please request a new one.');
  if (status !== 'code_valid') throw new Error(`Unexpected status: ${status}. Please try again.`);

  const telegramId = result?.user?.id?.toString()
    ?? result?.verification_status?.user_id?.toString()
    ?? null;

  return { valid: true, telegramId, status };
}

async function revokeVerificationCode(requestId) {
  try {
    await fetch(`${GATEWAY_BASE}/revokeVerificationMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getGatewayToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ request_id: requestId }),
    });
  } catch (err) {
    console.error('[gateway] revoke failed:', err.message);
  }
}

module.exports = { sendVerificationCode, checkVerificationCode, revokeVerificationCode };
