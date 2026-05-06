const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { Api } = require('telegram')

const apiId = Number.parseInt(process.env.TELEGRAM_API_ID, 10)
const apiHash = process.env.TELEGRAM_API_HASH

if (!Number.isFinite(apiId) || !apiHash) {
  console.warn('[mtproto] TELEGRAM_API_ID or TELEGRAM_API_HASH missing')
}

// key: phone -> { client, phoneCodeHash, expiresAt }
const pendingAuths = new Map()

setInterval(() => {
  const now = Date.now()
  for (const [phone, data] of pendingAuths.entries()) {
    if (now > data.expiresAt) {
      data.client.disconnect().catch(() => {})
      pendingAuths.delete(phone)
    }
  }
}, 5 * 60 * 1000)

async function sendOTP(phone) {
  if (!Number.isFinite(apiId) || !apiHash) {
    throw new Error('Telegram OTP is not configured on server')
  }

  if (pendingAuths.has(phone)) {
    const existing = pendingAuths.get(phone)
    await existing.client.disconnect().catch(() => {})
    pendingAuths.delete(phone)
  }

  const session = new StringSession('')
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
    useWSS: false,
  })

  await client.connect()

  const result = await client.invoke(
    new Api.auth.SendCode({
      phoneNumber: phone,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({
        allowFlashcall: false,
        currentNumber: false,
        allowAppHash: false,
      }),
    }),
  )

  pendingAuths.set(phone, {
    client,
    phoneCodeHash: result.phoneCodeHash,
    expiresAt: Date.now() + 10 * 60 * 1000,
  })

  return { ok: true }
}

async function verifyOTP(phone, code) {
  const pending = pendingAuths.get(phone)
  if (!pending) {
    throw new Error('No pending auth for this number. Request a new OTP.')
  }

  if (Date.now() > pending.expiresAt) {
    pendingAuths.delete(phone)
    await pending.client.disconnect().catch(() => {})
    throw new Error('OTP expired. Please request a new one.')
  }

  const { client, phoneCodeHash } = pending

  try {
    const result = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash,
        phoneCode: code.trim(),
      }),
    )

    const tgUser = result.user
    pendingAuths.delete(phone)
    await client.disconnect().catch(() => {})

    return {
      telegramId: tgUser.id.toString(),
      firstName: tgUser.firstName ?? '',
      lastName: tgUser.lastName ?? null,
      username: tgUser.username ?? null,
      phone: phone.replace('+', ''),
    }
  } catch (err) {
    const msg = String(err?.message || '')
    if (msg.includes('PHONE_CODE_INVALID')) {
      throw new Error('Invalid OTP code. Please try again.')
    }
    if (msg.includes('PHONE_CODE_EXPIRED')) {
      pendingAuths.delete(phone)
      await client.disconnect().catch(() => {})
      throw new Error('OTP expired. Please request a new one.')
    }
    if (msg.includes('SESSION_PASSWORD_NEEDED')) {
      pendingAuths.delete(phone)
      await client.disconnect().catch(() => {})
      throw new Error('2FA is enabled on this account. Please disable 2FA in Telegram settings and try again.')
    }
    throw err
  }
}

module.exports = { sendOTP, verifyOTP }
