'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Scan, Brain, Bell } from 'lucide-react'
import { NightAgentLogoMark } from '@/components/brand/night-agent-logo-mark'
import { StatCounter } from '@/components/landing/stat-counter'
import { Button } from '@/components/ui/button'

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.12 })
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.0, 0.0, 0.2, 1] }}
      className={className}
    >
      {children}
    </motion.section>
  )
}

const tickerItems = [
  { icon: '🤖', text: '14 of 20 top Polymarket wallets are bots' },
  { icon: '📊', text: '$44B+ prediction market volume in 2025' },
  { icon: '⚡', text: 'New markets open at 50/50 — first mover wins' },
  { icon: '🎯', text: '37% of AI agents profitable vs 7% of humans' },
  { icon: '🔒', text: 'Non-custodial — your keys never leave your wallet' },
  { icon: '📈', text: 'Black-Scholes · Kelly Criterion · Gemini AI' },
  { icon: '🏆', text: '68% win rate across 1,240+ markets analyzed' },
  { icon: '⏱️', text: 'Alerts delivered in under 60 seconds of market open' },
]

const howItWorks = [
  {
    icon: Scan,
    step: '01',
    title: 'Scan',
    body:
      "NightAgent monitors thousands of Jupiter prediction markets in real time, watching for unusual price movements and new market openings where crowd pricing hasn't caught up yet.",
  },
  {
    icon: Brain,
    step: '02',
    title: 'Analyze',
    body:
      'When something looks interesting, the AI reads recent news, runs Black-Scholes pricing and Kelly Criterion sizing, and calculates exactly how large the edge is — in plain numbers.',
  },
  {
    icon: Bell,
    step: '03',
    title: 'Alert',
    body:
      'You receive a Telegram message with the market, the math, and a suggested bet size. One tap to act on Jupiter, or skip it. You are always in control.',
  },
]

const manualVsAgent = [
  ['Browse markets by hand', 'Scans 3,400+ markets every 5min'],
  ['Bet based on gut feel', 'Black-Scholes probability model'],
  ['Miss new market openings', 'First-mover alerts within minutes'],
]

function BrowserFrameMock({ preferredSrc = '/dashboard.png' }: { preferredSrc?: string }) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImg = preferredSrc && !imgFailed

  return (
    <div className="min-w-0 w-full overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[var(--bg-secondary)] shadow-[0_0_40px_rgba(0,194,255,0.06)]">
      <div className="flex min-w-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-primary)] px-2 py-2 sm:px-3 sm:py-2.5">
        <span className="h-2 w-2 rounded-full bg-[#FF5F57]" />
        <span className="h-2 w-2 rounded-full bg-[#FEBC2E]" />
        <span className="h-2 w-2 rounded-full bg-[#28C840]" />
        <div className="ml-1 min-w-0 flex-1 truncate rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-[9px] font-mono text-[var(--text-muted)] sm:ml-2 sm:px-3 sm:text-[10px]">
          night-agent-548r.vercel.app/dashboard
        </div>
      </div>
      <div className="aspect-[16/10] bg-[var(--bg-primary)]">
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preferredSrc}
            alt="NightAgent dashboard"
            className="h-full w-full object-cover object-top"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full flex-col gap-2 p-3 sm:gap-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-14 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]"
                />
              ))}
            </div>
            <div className="grid min-h-[120px] flex-1 grid-cols-1 gap-2 sm:min-h-[140px] sm:grid-cols-3 sm:gap-3">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 sm:col-span-2">
                <div className="mb-3 h-2 w-24 rounded bg-[var(--border-bright)]" />
                <div className="flex h-[calc(100%-1.25rem)] items-end gap-1">
                  {[40, 55, 48, 62, 58, 70, 68, 75, 72, 80].map((h, j) => (
                    <div
                      key={j}
                      className="flex-1 rounded-sm bg-[var(--accent)]/35"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-glow)] p-3">
                <div className="mb-2 h-2 w-16 rounded bg-[var(--border-bright)]" />
                <div className="space-y-2">
                  {[...Array(4)].map((_, k) => (
                    <div key={k} className="h-2 rounded bg-[var(--border)]" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PhoneFrame({ preferredSrc = '/image.png' }: { preferredSrc?: string }) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImg = preferredSrc && !imgFailed

  return (
    <div className="relative mx-auto aspect-[9/19] w-[min(220px,70vw)] max-h-[440px]">
      <div className="pointer-events-none absolute inset-0 rounded-[clamp(28px,8vw,36px)] border-[clamp(4px,1.5vw,6px)] border-[var(--border-bright)] bg-[var(--bg-primary)] shadow-[0_0_40px_rgba(0,194,255,0.08)]" />
      <div className="pointer-events-none absolute left-1/2 top-[12px] h-3.5 w-16 -translate-x-1/2 rounded-full bg-[var(--border-bright)] sm:top-[14px] sm:h-4 sm:w-20" />
      <div className="absolute inset-[5px] overflow-hidden rounded-[clamp(22px,6vw,30px)] bg-[var(--bg-card)] sm:inset-[6px]">
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preferredSrc}
            alt="NightAgent Telegram alert on mobile"
            className="h-full w-full rounded-[clamp(18px,5vw,28px)] object-cover object-top"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--warning)]">
              Telegram Bot Preview
            </span>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
              Add <span className="font-mono text-[var(--text-secondary)]">image.png</span> (Telegram bot screenshot){' '}
              under <span className="font-mono text-[var(--text-secondary)]">public/</span> to show your bot UI.
            </p>
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-1/2 h-1 w-16 -translate-x-1/2 rounded-full bg-[var(--border-bright)] sm:bottom-[10px] sm:w-20" />
    </div>
  )
}

export function LandingView() {
  const router = useRouter()

  const headlineLine1 = ['The', 'AI', 'Quant', 'Layer', 'for']
  const headlineLine2 = ['Jupiter', 'Prediction', 'Markets']

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 pb-10 pt-8 text-center sm:px-6 sm:pb-0 sm:pt-0">
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              'linear-gradient(var(--border-bright) 1px, transparent 1px), linear-gradient(90deg, var(--border-bright) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[500px] w-[800px] rounded-full bg-[var(--accent-glow)] opacity-20 blur-[160px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 mb-8 flex items-center gap-2 rounded-full border border-[var(--border-bright)] bg-[var(--bg-card)] px-3 py-1.5"
        >
          <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-[var(--border-bright)]">
            <NightAgentLogoMark />
          </div>
          <span className="text-xs font-medium text-[var(--text-secondary)]">NightAgent — Early Access</span>
        </motion.div>

        <h1 className="relative z-10 mb-5 max-w-4xl text-[clamp(1.65rem,5.5vw,3.75rem)] font-bold leading-[1.12] sm:text-5xl lg:text-6xl">
          <span className="block">
            {headlineLine1.map((word, i) => (
              <motion.span
                key={`l1-${word}-${i}`}
                className="mr-[0.25em] inline-block"
                initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.045, ease: [0.0, 0.0, 0.2, 1] }}
              >
                {word}
              </motion.span>
            ))}
          </span>
          <span className="mt-1 block sm:mt-2">
            {headlineLine2.map((word, i) => (
              <motion.span
                key={`l2-${word}-${i}`}
                className="mr-[0.25em] inline-block"
                initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{
                  duration: 0.5,
                  delay: 0.2 + (headlineLine1.length + i) * 0.045,
                  ease: [0.0, 0.0, 0.2, 1],
                }}
              >
                <span className={word === 'Jupiter' ? 'text-[var(--accent)]' : undefined}>{word}</span>
              </motion.span>
            ))}
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.85 }}
          className="relative z-10 mb-8 max-w-xl px-1 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg"
        >
          NightAgent scans thousands of markets 24/7, finds mispriced bets using Black-Scholes and Kelly Criterion,
          and alerts you the moment there&apos;s real edge.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.05 }}
          className="relative z-10 mb-6"
        >
          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push('/login')}
            className="px-8 py-3.5 text-base shadow-[0_0_40px_var(--accent-glow)]"
          >
            Get Early Access →
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.35 }}
          className="relative z-10 text-xs text-[var(--text-muted)]"
        >
          No real money required · Paper trade to validate · 2-minute setup
        </motion.p>
      </section>

      {/* ── TICKER ───────────────────────────────────────────────────────── */}
      <div
        className="overflow-hidden border-y border-[var(--border)] bg-[var(--bg-card)] py-4"
        style={{
          maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
        }}
      >
        <div
          className="flex gap-12 whitespace-nowrap"
          style={{ animation: 'ticker 45s linear infinite', width: 'max-content' }}
        >
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)]">
              <span aria-hidden>{item.icon}</span>
              <span>{item.text}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <Section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
          How it works
        </p>
        <h2 className="mb-10 text-center text-2xl font-bold text-[var(--text-primary)] sm:mb-14 sm:text-3xl">
          Three steps to your edge
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {howItWorks.map(({ icon: Icon, step, title, body }) => (
            <div
              key={step}
              className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 transition-all duration-300 hover:border-[var(--accent)]/40 hover:shadow-[0_8px_30px_rgba(148,137,121,0.08)]"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-[var(--accent-dim)]">{step}</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-glow)]">
                  <Icon className="h-4 w-4 text-[var(--accent)]" />
                </div>
              </div>
              <h3 className="mb-2 text-base font-semibold text-[var(--text-primary)]">{title}</h3>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-12 px-2 text-center text-base italic text-[var(--accent)] sm:mt-16 sm:text-lg">
          &ldquo;You bring the judgment. We bring the signal.&rdquo;
        </p>
      </Section>

      {/* ── PRODUCT SHOWCASE ─────────────────────────────────────────────── */}
      <Section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
          Product
        </p>
        <h2 className="mb-3 px-2 text-center text-2xl font-bold leading-snug text-[var(--text-primary)] sm:text-3xl">
          The signal arrives before the crowd reacts.
        </h2>
        <p className="mx-auto mb-14 max-w-lg text-center text-sm leading-relaxed text-[var(--text-secondary)]">
          Dashboard tracks your edge in real time.
          <br />
          Telegram delivers the alert in seconds.
        </p>
        <div className="grid min-w-0 items-center gap-4 sm:gap-6 lg:grid-cols-2">
          <BrowserFrameMock />
          <div className="flex min-w-0 justify-center lg:justify-end">
            <PhoneFrame />
          </div>
        </div>
      </Section>

      {/* ── MANUAL VS NIGHTAGENT ─────────────────────────────────────────── */}
      <Section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
          Comparison
        </p>
        <h2 className="mb-10 text-center text-2xl font-bold text-[var(--text-primary)] sm:mb-14 sm:text-3xl">
          Manual trading vs NightAgent
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] opacity-70 saturate-[0.85]">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h3 className="text-sm font-semibold text-[var(--text-muted)]">Manual Trading</h3>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {manualVsAgent.map(([manual]) => (
                <div key={manual} className="px-5 py-3">
                  <p className="break-words text-sm text-[var(--text-muted)]">{manual}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            className="overflow-hidden rounded-2xl border bg-[var(--bg-card)] shadow-[0_0_30px_var(--accent-glow)]"
            style={{ borderColor: 'var(--accent-glow)' }}
          >
            <div className="border-b border-[var(--accent)]/20 bg-[var(--accent-glow)] px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 shrink-0 overflow-hidden rounded-lg ring-1 ring-[var(--accent)]/35">
                  <NightAgentLogoMark />
                </div>
                <h3 className="text-sm font-semibold text-[var(--accent-bright)]">NightAgent</h3>
              </div>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {manualVsAgent.map(([, agent]) => (
                <div key={agent} className="px-5 py-3">
                  <p className="break-words text-sm text-[var(--text-primary)]">{agent}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── CREDIBILITY NUMBERS ──────────────────────────────────────────── */}
      <Section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-12">
          <div className="mb-8 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-8">
            <StatCounter end={1240} suffix="+" duration={1800} label="Markets" sublabel="analyzed" />
            <StatCounter end={68} suffix="%" duration={1500} label="Paper trading" sublabel="win rate" />
            <div className="text-center">
              <p className="font-mono text-3xl font-bold text-[var(--text-primary)] sm:text-4xl">&lt; 60 sec</p>
              <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">Alert delivery</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">after market open</p>
            </div>
          </div>
          <p className="text-center text-sm text-[var(--text-secondary)]">
            The market is already automated. NightAgent gives you the same tools.
          </p>
        </div>
      </Section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <Section className="px-4 py-20 text-center sm:px-6 sm:py-32">
        <div className="mx-auto max-w-lg px-1">
          <h2 className="mb-4 text-3xl font-bold text-[var(--text-primary)] sm:text-5xl">Start in 2 minutes.</h2>
          <p className="mb-8 text-base text-[var(--text-muted)]">
            Connect Telegram. Pick your categories. Get your first alert.
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push('/login')}
            className="mb-4 px-8 py-3.5 text-base shadow-[0_0_50px_var(--accent-glow)]"
          >
            Get Early Access →
          </Button>
          <p className="text-xs text-[var(--text-muted)]">Free during early access · No credit card · Paper trading only</p>
        </div>
      </Section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-lg ring-1 ring-[var(--border-bright)]">
              <NightAgentLogoMark />
            </div>
            <span className="text-sm font-bold text-[var(--text-primary)]">NightAgent</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Built on Jupiter · Solana · Paper trading only</p>
          <div className="flex items-center gap-5 text-xs text-[var(--text-muted)]">
            {['GitHub', 'Twitter', 'Discord'].map(link => (
              <a key={link} href="#" className="transition-colors hover:text-[var(--text-secondary)]">
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
