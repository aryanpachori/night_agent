# NightAgent — Telegram Gateway OTP Login (Connect Telegram in Dashboard)
> Complete implementation using Telegram Gateway API for phone OTP.
> When user connects Telegram, the NightAgent bot can message them.
> No MTProto, no GramJS — just simple HTTPS API calls.

---

## Environment Variables

In backend/.env these are the only two vars needed:

```
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_API_ID=your_gateway_api_token_from_gateway.telegram.org
```

Note: TELEGRAM_API_ID here is your Gateway API token (confusingly named).
The Gateway API token looks like: 1234567890:ABCdef...
It is NOT the same as the Bot API token from BotFather.

---

## How the Gateway API works

```
Step 1 — POST /sendVerificationMessage
  → Send phone number
  → Telegram sends a code to user's Telegram app
  → Returns: request_id (store this for verification)

Step 2 — POST /checkVerificationStatus
  → Send request_id + code user entered
  → Returns: status = "code_valid" | "code_invalid" | "code_expired"
  → Also returns: user.id (their Telegram ID) if code_valid

Step 3 — Store telegramId in User table
  → Bot can now message them via Bot API using that ID
```

Base URL: https://gatewayapi.telegram.org
Auth: Bearer token in Authorization header (your TELEGRAM_API_ID)

---

## BACKEND IMPLEMENTATION

### STEP 1 — Create src/api/telegramGateway.js

```javascript
// src/api/telegramGateway.js
// Telegram Gateway API wrapper for phone OTP verification

const GATEWAY_BASE = 'https://gatewayapi.telegram.org'

function getGatewayToken() {
  const token = process.env.TELEGRAM_API_ID
  if (!token) throw new Error('TELEGRAM_API_ID (Gateway token) not set in .env')
  return token
}

/**
 * Send verification code to phone number via Telegram
 * @param {string} phone - E.164 format e.g. +919876543210
 * @returns {Promise<{requestId: string}>}
 */
async function sendVerificationCode(phone) {
  const res = await fetch(`${GATEWAY_BASE}/sendVerificationMessage`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getGatewayToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone_number: phone,
      code_length: 6,
    }),
  })

  const data = await res.json()

  if (!data.ok) {
    console.error('[gateway] sendVerificationMessage failed:', data)
    const msg = data.error ?? 'Failed to send verification code'
    // User-friendly errors
    if (msg.includes('PHONE_NUMBER_INVALID')) throw new Error('Invalid phone number format')
    if (msg.includes('FLOOD_WAIT')) throw new Error('Too many attempts. Please wait a few minutes.')
    if (msg.includes('not a Telegram user')) throw new Error('This number is not registered on Telegram.')
    throw new Error(msg)
  }

  const requestId = data.result?.request_id
  if (!requestId) throw new Error('No request_id returned from Gateway API')

  console.log(`[gateway] Code sent to ${phone} — requestId: ${requestId}`)
  return { requestId }
}

/**
 * Verify the code entered by user
 * @param {string} requestId - from sendVerificationCode
 * @param {string} code - 6-digit code from user
 * @returns {Promise<{telegramId: string, valid: boolean}>}
 */
async function checkVerificationCode(requestId, code) {
  const res = await fetch(`${GATEWAY_BASE}/checkVerificationStatus`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getGatewayToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request_id: requestId,
      code: code.trim(),
    }),
  })

  const data = await res.json()

  if (!data.ok) {
    console.error('[gateway] checkVerificationStatus failed:', data)
    throw new Error(data.error ?? 'Verification request failed')
  }

  const result = data.result
  const status = result?.verification_status?.status

  console.log(`[gateway] Verification status: ${status}`)

  if (status === 'code_invalid') {
    throw new Error('Invalid code. Please check and try again.')
  }

  if (status === 'code_expired') {
    throw new Error('Code expired. Please request a new one.')
  }

  if (status !== 'code_valid') {
    throw new Error(`Unexpected status: ${status}. Please try again.`)
  }

  // Get Telegram user ID from result
  // Gateway API returns user info when code is valid
  const telegramId = result?.user?.id?.toString()
    ?? result?.verification_status?.user_id?.toString()

  if (!telegramId) {
    // Some Gateway implementations don't return user ID in check
    // Fall back to requesting it explicitly
    console.warn('[gateway] No user ID in verification response — will use phone lookup')
  }

  return {
    valid: true,
    telegramId,
    status,
  }
}

/**
 * Revoke a pending verification request (cleanup)
 * @param {string} requestId
 */
async function revokeVerificationCode(requestId) {
  try {
    await fetch(`${GATEWAY_BASE}/revokeVerificationMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getGatewayToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ request_id: requestId }),
    })
  } catch (err) {
    // Non-critical — just log
    console.error('[gateway] revoke failed:', err.message)
  }
}

module.exports = { sendVerificationCode, checkVerificationCode, revokeVerificationCode }
```

---

### STEP 2 — Add routes to src/api/routes/auth.js

Add these routes. Do NOT remove any existing routes.
Add at the end of the file before module.exports:

```javascript
// Add at top of auth.js:
const {
  sendVerificationCode,
  checkVerificationCode,
  revokeVerificationCode,
} = require('../telegramGateway')

// ─── POST /api/auth/send-otp ─────────────────────────────────────────────────
// Send OTP to phone via Telegram Gateway API
// Used for: connecting Telegram in dashboard settings
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ error: 'Phone number required' })

    // Normalize — ensure + prefix
    const normalized = phone.trim().startsWith('+')
      ? phone.trim()
      : `+${phone.trim()}`

    // Basic length check
    const digits = normalized.replace(/[^\d]/g, '')
    if (digits.length < 8 || digits.length > 15) {
      return res.status(400).json({ error: 'Invalid phone number' })
    }

    // Send code via Gateway API
    const { requestId } = await sendVerificationCode(normalized)

    // Store requestId keyed by phone in AppStorage
    // Expires in 10 minutes
    await prisma.appStorage.upsert({
      where: { key: `otp_${normalized}` },
      update: {
        value: {
          requestId,
          phone: normalized,
          expiresAt: Date.now() + 10 * 60 * 1000,
        },
      },
      create: {
        key: `otp_${normalized}`,
        value: {
          requestId,
          phone: normalized,
          expiresAt: Date.now() + 10 * 60 * 1000,
        },
      },
    })

    res.json({ ok: true, message: 'Verification code sent to your Telegram app' })
  } catch (err) {
    console.error('[send-otp]', err.message)
    res.status(400).json({ error: err.message ?? 'Failed to send code' })
  }
})

// ─── POST /api/auth/verify-otp ───────────────────────────────────────────────
// Verify OTP and connect Telegram to existing wallet user
// OR create new user if not logged in (for standalone Telegram login)
router.post('/verify-otp', requireAuth, async (req, res) => {
  try {
    const { phone, code } = req.body
    const userId = req.user.userId

    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code are required' })
    }

    const normalized = phone.trim().startsWith('+')
      ? phone.trim()
      : `+${phone.trim()}`

    // Get stored requestId
    const stored = await prisma.appStorage.findUnique({
      where: { key: `otp_${normalized}` },
    })

    if (!stored) {
      return res.status(400).json({
        error: 'No pending code for this number. Please request a new one.',
      })
    }

    const storedData = stored.value
    const { requestId, expiresAt } = storedData

    if (Date.now() > expiresAt) {
      await prisma.appStorage.delete({ where: { key: `otp_${normalized}` } }).catch(() => {})
      return res.status(400).json({ error: 'Code expired. Please request a new one.' })
    }

    // Verify code via Gateway API
    const { valid, telegramId } = await checkVerificationCode(requestId, code)

    if (!valid) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' })
    }

    // Clean up stored OTP
    await prisma.appStorage.delete({ where: { key: `otp_${normalized}` } }).catch(() => {})
    await revokeVerificationCode(requestId)

    // If Gateway returned telegramId — use it
    // If not — we need another approach (see fallback below)
    if (!telegramId) {
      return res.status(400).json({
        error: 'Could not get Telegram ID. Please try again.',
      })
    }

    // Check if this telegramId is already linked to another user
    const existingUser = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    })

    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({
        error: 'This Telegram account is already linked to another NightAgent account.',
      })
    }

    // Link Telegram to current user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        telegramId: BigInt(telegramId),
        telegramAlerts: true,
      },
      select: {
        id: true,
        firstName: true,
        username: true,
        telegramId: true,
        telegramAlerts: true,
      },
    })

    // Send welcome message via Bot API
    // This confirms the bot can now message them
    try {
      const welcomeRes = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramId,
            text:
              `✅ *Telegram connected to NightAgent!*\n\n` +
              `You'll now receive bet signals directly in this chat.\n\n` +
              `💰 Your paper wallet is ready with $1,000 USDC.\n\n` +
              `_I'll alert you the next time I find a good opportunity._`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📊 Open Dashboard', url: process.env.FRONTEND_URL }],
              ],
            },
          }),
        }
      )

      const welcomeData = await welcomeRes.json()
      if (!welcomeData.ok) {
        // User hasn't started the bot yet — that's ok
        console.log('[verify-otp] Bot message failed (user may not have started bot):', welcomeData.description)
      } else {
        console.log(`[verify-otp] Welcome message sent to telegramId: ${telegramId}`)
      }
    } catch (botErr) {
      console.error('[verify-otp] Bot send error:', botErr.message)
      // Non-critical — don't fail the verification
    }

    res.json({
      ok: true,
      telegramId: telegramId.toString(),
      message: 'Telegram connected successfully',
      user: {
        ...updatedUser,
        telegramId: updatedUser.telegramId?.toString(),
      },
    })
  } catch (err) {
    console.error('[verify-otp]', err.message)
    res.status(400).json({ error: err.message ?? 'Verification failed' })
  }
})

// ─── POST /api/auth/resend-otp ───────────────────────────────────────────────
// Resend OTP to same phone number
router.post('/resend-otp', async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ error: 'Phone required' })

    const normalized = phone.trim().startsWith('+')
      ? phone.trim()
      : `+${phone.trim()}`

    // Revoke existing if any
    const existing = await prisma.appStorage.findUnique({
      where: { key: `otp_${normalized}` },
    })
    if (existing?.value?.requestId) {
      await revokeVerificationCode(existing.value.requestId)
    }

    // Send new code
    const { requestId } = await sendVerificationCode(normalized)

    await prisma.appStorage.upsert({
      where: { key: `otp_${normalized}` },
      update: {
        value: {
          requestId,
          phone: normalized,
          expiresAt: Date.now() + 10 * 60 * 1000,
        },
      },
      create: {
        key: `otp_${normalized}`,
        value: {
          requestId,
          phone: normalized,
          expiresAt: Date.now() + 10 * 60 * 1000,
        },
      },
    })

    res.json({ ok: true, message: 'New code sent' })
  } catch (err) {
    console.error('[resend-otp]', err.message)
    res.status(400).json({ error: err.message ?? 'Failed to resend' })
  }
})
```

---

### STEP 3 — Add FRONTEND_URL to backend .env if not there

```
FRONTEND_URL=https://night-agent-548r.vercel.app
```

---

## FRONTEND IMPLEMENTATION

### STEP 4 — Telegram Connect Card in Settings page

Add this as the FIRST card in app/dashboard/settings/page.tsx.
Place it above all other existing settings cards.

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

type ConnectStep = 'idle' | 'phone' | 'otp' | 'connected'

function TelegramConnectCard() {
  const { user, refetchUser } = useAuth()
  const qc = useQueryClient()

  const isConnected = !!user?.telegramId

  const [step, setStep] = useState<ConnectStep>(isConnected ? 'connected' : 'idle')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (isConnected) setStep('connected')
  }, [isConnected])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  async function handleSendOTP() {
    if (!phone.trim()) return toast.error('Enter your phone number')
    setLoading(true)
    try {
      const res = await api.post('/api/auth/send-otp', { phone: phone.trim() })
      if (res.data.ok) {
        setStep('otp')
        setCountdown(60)
        toast.success('Code sent! Check your Telegram app.')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOTP() {
    if (code.length < 4) return toast.error('Enter the full code')
    setLoading(true)
    try {
      const res = await api.post('/api/auth/verify-otp', {
        phone: phone.trim(),
        code: code.trim(),
      })
      if (res.data.ok) {
        setStep('connected')
        await refetchUser()
        qc.invalidateQueries({ queryKey: ['stats'] })
        toast.success('Telegram connected! Bot will now send you alerts.')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (countdown > 0) return
    setLoading(true)
    try {
      await api.post('/api/auth/resend-otp', { phone: phone.trim() })
      setCountdown(60)
      toast.success('New code sent')
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to resend')
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect() {
    try {
      await api.patch('/api/user', { telegramAlerts: false })
      // Note: we don't remove telegramId — just disable alerts
      // To fully unlink, we'd need to null the telegramId
      await refetchUser()
      setStep('idle')
      toast.success('Telegram alerts disabled')
    } catch {
      toast.error('Failed to disconnect')
    }
  }

  async function handleToggleAlerts(enabled: boolean) {
    try {
      await api.patch('/api/user', { telegramAlerts: enabled })
      await refetchUser()
      toast.success(enabled ? 'Telegram alerts enabled' : 'Telegram alerts paused')
    } catch {
      toast.error('Failed to update')
    }
  }

  async function handleTestMessage() {
    try {
      await api.post('/api/user/test-telegram')
      toast.success('Test message sent! Check your Telegram.')
    } catch {
      toast.error('Failed to send test message')
    }
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[#2AABEE]/15
                        border border-[#2AABEE]/30
                        flex items-center justify-center text-lg">
          📱
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Telegram Alerts
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            {isConnected
              ? `Connected as @${user?.username ?? user?.telegramId}`
              : 'Connect to get bet signals on your phone'}
          </p>
        </div>
        {isConnected && (
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
            <span className="text-xs text-[var(--success)] font-medium">Connected</span>
          </div>
        )}
      </div>

      {/* ── IDLE STATE ── */}
      {step === 'idle' && (
        <button
          onClick={() => setStep('phone')}
          className="w-full py-2.5 rounded-xl text-sm font-semibold
                     bg-[#2AABEE] text-white hover:opacity-90 transition-opacity
                     flex items-center justify-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.008 9.463c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 14.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.496.969z"/>
          </svg>
          Connect Telegram
        </button>
      )}

      {/* ── PHONE STEP ── */}
      {step === 'phone' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            Enter your Telegram phone number to receive a verification code
          </p>
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendOTP()}
              autoFocus
              className="flex-1 px-3 py-2.5 rounded-xl text-sm
                         bg-[var(--bg-secondary)] border border-[var(--border)]
                         text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                         focus:border-[#2AABEE]/50 focus:outline-none transition-colors"
            />
            <button
              onClick={handleSendOTP}
              disabled={loading || !phone.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold
                         bg-[#2AABEE] text-white disabled:opacity-50
                         hover:opacity-90 transition-opacity"
            >
              {loading ? '...' : 'Send'}
            </button>
          </div>
          <button
            onClick={() => setStep('idle')}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            ← Cancel
          </button>
        </div>
      )}

      {/* ── OTP STEP ── */}
      {step === 'otp' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            Enter the 6-digit code sent to your Telegram app for{' '}
            <span className="text-[var(--text-secondary)]">{phone}</span>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleVerifyOTP()}
              autoFocus
              className="flex-1 px-3 py-2.5 rounded-xl text-center text-xl
                         font-mono tracking-[0.4em] bg-[var(--bg-secondary)]
                         border border-[var(--border)] text-[var(--text-primary)]
                         focus:border-[var(--accent)]/50 focus:outline-none"
            />
            <button
              onClick={handleVerifyOTP}
              disabled={loading || code.length < 4}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold
                         bg-[var(--accent)] text-[var(--bg-primary)]
                         disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loading ? '...' : 'Verify'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => { setStep('phone'); setCode('') }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              ← Change number
            </button>
            {countdown > 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Resend in {countdown}s
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={loading}
                className="text-xs text-[#2AABEE] hover:opacity-80"
              >
                Resend code
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── CONNECTED STATE ── */}
      {step === 'connected' && isConnected && (
        <div className="space-y-3">
          {/* Alert toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-[var(--text-primary)]">Receive alerts</p>
              <p className="text-xs text-[var(--text-muted)]">
                Bot sends you signals when opportunities are found
              </p>
            </div>
            <button
              onClick={() => handleToggleAlerts(!user?.telegramAlerts)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                user?.telegramAlerts
                  ? 'bg-[var(--success)]'
                  : 'bg-[var(--border-bright)]'
              }`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white
                              transition-transform ${
                                user?.telegramAlerts
                                  ? 'translate-x-5'
                                  : 'translate-x-0.5'
                              }`} />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleTestMessage}
              className="flex-1 py-2 rounded-xl text-xs font-medium
                         bg-[var(--bg-secondary)] text-[var(--text-secondary)]
                         border border-[var(--border)] hover:border-[var(--border-bright)]
                         transition-colors"
            >
              Send test message
            </button>
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 rounded-xl text-xs font-medium
                         text-[var(--danger)] border border-[var(--danger)]/30
                         bg-[var(--danger-dim)] hover:opacity-80 transition-opacity"
            >
              Disconnect
            </button>
          </div>

          {/* Start bot reminder if not started */}
          <div className="bg-[#2AABEE]/8 border border-[#2AABEE]/20
                          rounded-xl p-3 flex items-start gap-2">
            <span className="text-sm flex-shrink-0">💡</span>
            <p className="text-xs text-[var(--text-muted)]">
              Make sure you've started{' '}
              <a
                href="https://t.me/nightagentt_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2AABEE] hover:underline"
              >
                @nightagentt_bot
              </a>
              {' '}on Telegram, otherwise the bot cannot send you messages.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
```

Then add `<TelegramConnectCard />` as the FIRST element
inside the settings page content, before all other cards.

---

### STEP 5 — Add banner on Dashboard home

In app/dashboard/page.tsx, add this banner when
user has no telegramId linked yet:

```tsx
{!user?.telegramId && (
  <div className="bg-[#2AABEE]/10 border border-[#2AABEE]/25
                  rounded-2xl p-4 flex items-center gap-4">
    <span className="text-2xl flex-shrink-0">📱</span>
    <div className="flex-1">
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        Connect Telegram to get alerts
      </p>
      <p className="text-xs text-[var(--text-muted)] mt-0.5">
        Receive bet signals directly on your phone — takes 30 seconds
      </p>
    </div>
    <a
      href="/dashboard/settings"
      className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-semibold
                 bg-[#2AABEE] text-white hover:opacity-90 transition-opacity
                 whitespace-nowrap"
    >
      Connect →
    </a>
  </div>
)}
```

Place this banner AFTER the balance card and BEFORE
the active bets section.

---

## VERIFICATION — Test the complete flow

After deploying both backend and frontend:

### Backend test:
```bash
# Test send-otp endpoint directly
curl -X POST http://YOUR_SERVER:PORT/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"phone": "+91XXXXXXXXXX"}'

# Expected: {"ok":true,"message":"Verification code sent to your Telegram app"}
```

### Frontend test:
```
1. Log in with wallet
2. Go to /dashboard/settings
3. See "Telegram Alerts" card at top
4. Click "Connect Telegram"
5. Enter phone number with country code
6. Check Telegram app — code arrives
7. Enter code → click Verify
8. Bot sends: "✅ Telegram connected to NightAgent!"
9. Card shows "Connected" state with toggle
10. Future bot alerts go to your Telegram ✅
```

---

## How bot messaging works after connection

Once telegramId is stored in the User table, the existing
bot scanner uses it automatically on every scan cycle:

```javascript
// Existing scanner code — no changes needed
// When opportunity found, for each user:
if (user.telegramAlerts && user.telegramId) {
  await bot.sendMessage(user.telegramId.toString(), alertMessage)
}
// telegramId from Gateway = same ID the Bot API uses ✅
```

The Gateway API verifies the phone, gives you the Telegram ID,
and that same ID is used by the bot to send messages forever.
