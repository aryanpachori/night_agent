'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Badge } from '@/components/ui/badge'
import { mockWallet, mockUser } from '@/data/mock'
import { formatUSD, formatPct } from '@/lib/utils'
import { staggerItem, staggerContainer } from '@/lib/animations'
import { RotateCcw, LogOut, MessageCircle } from 'lucide-react'

const allCategories = ['Crypto', 'Politics', 'Economics', 'Sports', 'Entertainment', 'Science', 'Climate']

const riskModes = [
  { id: 'conservative', label: 'Conservative', kelly: '0.25×', maxBet: '2%', desc: 'Quarter Kelly, very small bets' },
  { id: 'moderate',     label: 'Moderate',     kelly: '0.5×',  maxBet: '5%', desc: 'Half Kelly, balanced approach' },
  { id: 'aggressive',   label: 'Aggressive',   kelly: '1.0×',  maxBet: '10%', desc: 'Full Kelly, maximum growth' },
]

export default function SettingsPage() {
  const [categories, setCategories] = useState(mockUser.categories)
  const [riskMode, setRiskMode] = useState(mockUser.riskMode)
  const [minEdge, setMinEdge] = useState('8')
  const [minVolume, setMinVolume] = useState('1')
  const [minDays, setMinDays] = useState('1')
  const [maxDays, setMaxDays] = useState('365')
  const [changed, setChanged] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const toggleCategory = (cat: string) => {
    const lower = cat.toLowerCase()
    setCategories(prev => prev.includes(lower) ? prev.filter(c => c !== lower) : [...prev, lower])
    setChanged(true)
  }

  return (
    <div className="flex flex-col flex-1">
      <Topbar title="Settings" subtitle="Configure your NightAgent preferences" />

      <div className="p-6">
        <motion.div
          className="max-w-2xl space-y-5"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {/* Categories */}
          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Market Categories</h3>
              <div className="flex flex-wrap gap-2">
                {allCategories.map(cat => {
                  const active = categories.includes(cat.toLowerCase())
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        active
                          ? 'bg-[var(--accent-glow)] border-[var(--accent)]/50 text-[var(--accent-bright)] shadow-[0_0_12px_var(--accent-glow)]'
                          : 'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-bright)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      {cat}
                    </button>
                  )
                })}
              </div>
            </Card>
          </motion.div>

          {/* Risk Mode */}
          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Risk Mode</h3>
              <div className="grid grid-cols-3 gap-3">
                {riskModes.map(mode => {
                  const active = riskMode === mode.id
                  return (
                    <button
                      key={mode.id}
                      onClick={() => { setRiskMode(mode.id as typeof riskMode); setChanged(true) }}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        active
                          ? 'bg-[var(--accent-glow)] border-[var(--accent)]/50 shadow-[0_0_20px_var(--accent-glow)]'
                          : 'bg-[var(--bg-secondary)] border-[var(--border)] hover:border-[var(--border-bright)]'
                      }`}
                    >
                      <p className={`text-sm font-semibold mb-2 ${active ? 'text-[var(--accent-bright)]' : 'text-[var(--text-primary)]'}`}>
                        {mode.label}
                      </p>
                      <div className="space-y-1 text-[10px] font-mono">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Kelly</span>
                          <span className={active ? 'text-[var(--accent-bright)]' : 'text-[var(--text-secondary)]'}>{mode.kelly}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Max bet</span>
                          <span className={active ? 'text-[var(--accent-bright)]' : 'text-[var(--text-secondary)]'}>{mode.maxBet}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-2">{mode.desc}</p>
                    </button>
                  )
                })}
              </div>
            </Card>
          </motion.div>

          {/* Paper Wallet */}
          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Paper Wallet</h3>
                <Badge variant={mockWallet.totalPnl >= 0 ? 'success' : 'danger'}>
                  {formatPct(mockWallet.roi)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  ['Balance', formatUSD(mockWallet.balance)],
                  ['Total P&L', (mockWallet.totalPnl >= 0 ? '+' : '') + formatUSD(mockWallet.totalPnl)],
                  ['Win Rate', `${mockWallet.winRate}%`],
                  ['Brier Score', mockWallet.brierScore.toFixed(2)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[var(--bg-secondary)] rounded-lg p-3">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-mono font-bold text-[var(--text-primary)] mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {!showResetConfirm ? (
                <Button variant="secondary" size="sm" icon={<RotateCcw className="w-3 h-3" />} onClick={() => setShowResetConfirm(true)}>
                  Reset to $1,000
                </Button>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-[var(--danger-dim)] border border-[var(--danger)]/30 rounded-lg">
                  <p className="text-xs text-[var(--danger)] flex-1">Reset all history and balance?</p>
                  <Button variant="danger" size="sm" onClick={() => setShowResetConfirm(false)}>Confirm</Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
                </div>
              )}
            </Card>
          </motion.div>

          {/* Alert Filters */}
          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Alert Filters</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Min Edge', value: minEdge, onChange: setMinEdge, suffix: '%', placeholder: '8' },
                  { label: 'Min Volume', value: minVolume, onChange: setMinVolume, prefix: '$', placeholder: '1', suffix: 'M' },
                  { label: 'Min Days Left', value: minDays, onChange: setMinDays, suffix: 'days', placeholder: '1' },
                  { label: 'Max Days Left', value: maxDays, onChange: setMaxDays, suffix: 'days', placeholder: '365' },
                ].map(({ label, value, onChange, prefix, suffix, placeholder }) => (
                  <div key={label}>
                    <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">{label}</label>
                    <div className="relative flex items-center">
                      {prefix && <span className="absolute left-3 text-xs text-[var(--text-muted)] font-mono">{prefix}</span>}
                      <input
                        type="number"
                        value={value}
                        placeholder={placeholder}
                        onChange={e => { onChange(e.target.value); setChanged(true) }}
                        className={`w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] font-mono py-2 outline-none focus:border-[var(--accent)] transition-colors ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-12' : 'pr-3'}`}
                      />
                      {suffix && <span className="absolute right-3 text-xs text-[var(--text-muted)] font-mono">{suffix}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>

          {/* Telegram */}
          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Telegram</h3>
              <div className="flex items-center gap-3 p-3 bg-[var(--success-dim)] border border-[var(--success)]/30 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-[#2AABEE]/20 border border-[#2AABEE]/30 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-[#2AABEE]" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-[var(--text-primary)]">Connected</p>
                  <p className="text-xs text-[var(--text-muted)] font-mono">@{mockUser.username}</p>
                </div>
                <Badge variant="success" size="sm">Active</Badge>
              </div>
            </Card>
          </motion.div>

          {/* Account */}
          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Account</h3>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dim)] flex items-center justify-center text-[var(--bg-primary)] text-sm font-bold">
                  {mockUser.firstName[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{mockUser.firstName}</p>
                  <p className="text-xs text-[var(--text-muted)] font-mono">@{mockUser.username}</p>
                </div>
              </div>
              <Button variant="danger" size="sm" icon={<LogOut className="w-3 h-3" />}>Sign Out</Button>
            </Card>
          </motion.div>

          {/* Save button */}
          {changed && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <div className="sticky bottom-6 flex justify-end">
                <Button variant="primary" size="md" onClick={() => setChanged(false)}>
                  Save Changes
                </Button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
