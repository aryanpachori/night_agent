import { LoginClient } from './login-client'

/** Read Telegram bot username on the server so Vercel env updates apply without stale client inlining. */
export const dynamic = 'force-dynamic'

function telegramBotUsernameFromEnv(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export default function LoginPage() {
  return <LoginClient telegramBotUsername={telegramBotUsernameFromEnv()} />
}
