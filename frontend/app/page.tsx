'use client'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Zap, Scan, Brain, Bell, Shield, TestTube2, Smartphone } from 'lucide-react'
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
  '🤖  14 of 20 top Polymarket traders are bots',
  '📊  $44B+ prediction market volume in 2025',
  '⚡  First mover edge: new markets open at 50/50',
  '🎯  37% of AI agents profitable vs 7% of humans',
  '🔒  Your keys never leave your wallet',
  '📈  Black-Scholes · Kelly Criterion · Gemini AI',
]

const howItWorks = [
  { icon: Scan,  step: '01', title: 'Scan', body: 'NightAgent monitors thousands of Jupiter prediction markets in real time, watching for unusual price movements and new market openings where crowd pricing hasn\'t caught up yet.' },
  { icon: Brain, step: '02', title: 'Analyze', body: 'When something looks interesting, the AI reads recent news, runs Black-Scholes pricing and Kelly Criterion sizing, and calculates exactly how large the edge is — in plain numbers.' },
  { icon: Bell,  step: '03', title: 'Alert', body: 'You receive a Telegram message with the market, the math, and a suggested bet size. One tap to act on Jupiter, or skip it. You are always in control.' },
]

const manualVsAgent = [
  ['Browse markets by hand', 'Scans 3,400+ markets every 5 min'],
  ['Estimate odds from gut feel', 'Black-Scholes probability model'],
  ['Bet random amounts', 'Kelly Criterion optimal sizing'],
  ['Miss new market openings', 'First-mover alerts within minutes'],
  ['React to news you happen to see', '15 news sources monitored per market'],
  ['One market at a time', 'Watches everything simultaneously'],
]

const features = [
  { icon: Brain, title: 'AI Probability Engine', body: 'Combines Black-Scholes binary options pricing, EWMA volatility modeling, momentum signals, and Gemini AI news analysis. All fused in logit space so probabilities never add up wrong.', large: true },
  { icon: Smartphone, title: 'Telegram Alerts', body: 'Opportunity arrives in Telegram with edge, EV, suggested size, and one-tap link to Jupiter. No dashboard required to act.' },
  { icon: TestTube2, title: 'Paper Trading First', body: 'Start with $1,000 simulated USDC. Validate the signals risk-free before committing real capital.' },
  { icon: Shield, title: 'Non-Custodial', body: 'Your wallet connects to Jupiter directly. NightAgent never holds or touches your funds.' },
]

export default function LandingPage() {
  const router = useRouter()

  const headline = "Trade smarter on Jupiter Prediction Markets"
  const words = headline.split(' ')

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-x-hidden">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center overflow-hidden">
        {/* Grid background */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(var(--border-bright) 1px, transparent 1px), linear-gradient(90deg, var(--border-bright) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* Glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[800px] h-[500px] rounded-full bg-[var(--accent-glow)] blur-[160px] opacity-20" />
        </div>

        {/* Logo pill */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-bright)] mb-8"
        >
          <div className="w-5 h-5 rounded bg-[var(--accent)] flex items-center justify-center">
            <Zap className="w-3 h-3 text-[var(--bg-primary)]" />
          </div>
          <span className="text-xs font-medium text-[var(--text-secondary)]">NightAgent — Early Access</span>
        </motion.div>

        {/* Headline word-by-word */}
        <motion.h1
          className="text-6xl font-bold leading-tight mb-5 max-w-3xl relative z-10"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.05, delayChildren: 0.2 } } }}
        >
          {words.map((word, i) => (
            <motion.span
              key={i}
              className="inline-block mr-[0.25em]"
              variants={{
                hidden:  { opacity: 0, y: 20, filter: 'blur(8px)' },
                visible: { opacity: 1, y: 0,  filter: 'blur(0px)',
                  transition: { duration: 0.5, ease: [0.0, 0.0, 0.2, 1] } },
              }}
            >
              <span className={word === 'Jupiter' ? 'text-[var(--accent)]' : ''}>{word}</span>
            </motion.span>
          ))}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.85 }}
          className="text-lg text-[var(--text-secondary)] max-w-[520px] leading-relaxed mb-8 relative z-10"
        >
          NightAgent watches thousands of markets 24/7, finds mispriced bets using AI and quant math,
          and alerts you when there&apos;s real edge. You decide. One tap to act.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.1 }}
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
          transition={{ duration: 0.6, delay: 1.4 }}
          className="text-xs text-[var(--text-muted)] relative z-10"
        >
          No real money required · Paper trade to validate · 2-minute setup
        </motion.p>
      </section>

      {/* ── TICKER ───────────────────────────────────────────────────────── */}
      <div className="border-y border-[var(--border)] bg-[var(--bg-card)] py-4 overflow-hidden" style={{
        maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
      }}>
        <div
          className="flex gap-10 whitespace-nowrap"
          style={{ animation: 'ticker 40s linear infinite', width: 'max-content' }}
        >
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="text-sm text-[var(--text-muted)] font-medium">{item}</span>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <Section className="py-24 px-6 max-w-5xl mx-auto">
        <p className="text-xs text-[var(--accent)] uppercase tracking-widest text-center mb-3 font-semibold">How it works</p>
        <h2 className="text-3xl font-bold text-center text-[var(--text-primary)] mb-14">Three steps to your edge</h2>
        <div className="grid grid-cols-3 gap-6">
          {howItWorks.map(({ icon: Icon, step, title, body }) => (
            <div key={step} className="group bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 hover:border-[var(--accent)]/40 hover:shadow-[0_8px_30px_rgba(148,137,121,0.08)] transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-mono text-[var(--accent-dim)] font-bold">{step}</span>
                <div className="w-8 h-8 rounded-xl bg-[var(--accent-glow)] flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[var(--accent)]" />
                </div>
              </div>
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-lg italic text-[var(--accent)] mt-16">
          &ldquo;You bring the judgment. We bring the signal.&rdquo;
        </p>
      </Section>

      {/* ── THE EDGE ─────────────────────────────────────────────────────── */}
      <Section className="py-24 px-6 max-w-5xl mx-auto">
        <p className="text-xs text-[var(--accent)] uppercase tracking-widest text-center mb-3 font-semibold">Why NightAgent</p>
        <h2 className="text-3xl font-bold text-center text-[var(--text-primary)] mb-14">The edge you&apos;re leaving on the table</h2>
        <div className="grid grid-cols-2 gap-5">
          {/* Manual */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden opacity-70">
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--text-muted)]">Manual Trading</h3>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {manualVsAgent.map(([manual]) => (
                <div key={manual} className="px-5 py-3">
                  <p className="text-sm text-[var(--text-muted)]">{manual}</p>
                </div>
              ))}
            </div>
          </div>

          {/* NightAgent */}
          <div className="bg-[var(--bg-card)] border border-[var(--accent)]/30 rounded-2xl overflow-hidden shadow-[0_0_30px_var(--accent-glow)]">
            <div className="px-5 py-4 border-b border-[var(--accent)]/20 bg-[var(--accent-glow)]">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-semibold text-[var(--accent-bright)]">NightAgent</h3>
              </div>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {manualVsAgent.map(([, agent]) => (
                <div key={agent} className="px-5 py-3">
                  <p className="text-sm text-[var(--text-primary)]">{agent}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── CREDIBILITY NUMBERS ──────────────────────────────────────────── */}
      <Section className="py-24 px-6">
        <div className="max-w-3xl mx-auto bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-12">
          <div className="grid grid-cols-3 gap-8 mb-8">
            <StatCounter end={44} prefix="$" suffix="B+" label="Prediction market" sublabel="volume in 2025" duration={1800} />
            <StatCounter end={37} suffix="%" label="AI agent win rate" sublabel="vs 7% human" duration={1500} />
            <StatCounter end={14} label="Top Polymarket" sublabel="wallets are bots" duration={1200} />
          </div>
          <p className="text-center text-sm text-[var(--text-muted)]">
            The market is already automated. NightAgent gives you the same tools.
          </p>
        </div>
      </Section>

      {/* ── FEATURES BENTO ───────────────────────────────────────────────── */}
      <Section className="py-24 px-6 max-w-5xl mx-auto">
        <p className="text-xs text-[var(--accent)] uppercase tracking-widest text-center mb-3 font-semibold">What you get</p>
        <h2 className="text-3xl font-bold text-center text-[var(--text-primary)] mb-14">Everything you need to find edge</h2>
        <div className="grid grid-cols-2 gap-4">
          {features.map(({ icon: Icon, title, body, large }) => (
            <div
              key={title}
              className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 hover:border-[var(--accent)]/35 transition-all duration-300 ${large ? 'col-span-2' : ''}`}
            >
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-glow)] border border-[var(--accent)]/25 flex items-center justify-center mb-4">
                <Icon className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-xl">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <Section className="py-32 px-6 text-center">
        <div className="max-w-lg mx-auto">
          <h2 className="text-5xl font-bold text-[var(--text-primary)] mb-4">Start in 2 minutes.</h2>
          <p className="text-base text-[var(--text-muted)] mb-8">
            Connect Telegram. Pick your categories. Get your first alert.
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push('/login')}
            className="px-8 py-3.5 text-base shadow-[0_0_50px_var(--accent-glow)] mb-4"
          >
            Get Early Access →
          </Button>
          <p className="text-xs text-[var(--text-muted)]">
            Free during early access · No credit card · Paper trading only
          </p>
        </div>
      </Section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[var(--accent)] flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-[var(--bg-primary)]" />
            </div>
            <span className="font-bold text-sm text-[var(--text-primary)]">NightAgent</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Built on Jupiter · Solana · Paper trading only
          </p>
          <div className="flex items-center gap-5 text-xs text-[var(--text-muted)]">
            {['GitHub', 'Twitter', 'Discord'].map(link => (
              <a key={link} href="#" className="hover:text-[var(--text-secondary)] transition-colors">{link}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
