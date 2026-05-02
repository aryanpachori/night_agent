'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { scaleIn, fadeIn } from '@/lib/animations'
import { formatUSD, formatPrice } from '@/lib/utils'

interface Position {
  id: string
  marketQuestion: string
  side: 'YES' | 'NO'
  contracts: number
  entryPrice: number
  currentPrice: number
  currentValue: number
  pnl: number
}

interface ExitModalProps {
  isOpen: boolean
  onClose: () => void
  position: Position | null
}

export function ExitModal({ isOpen, onClose, position }: ExitModalProps) {
  if (!position) return null
  const pnlPositive = position.pnl >= 0

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-bright)] rounded-2xl p-6 shadow-2xl mx-4">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Exit Position</h2>
                <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-[var(--bg-secondary)] rounded-xl p-4 mb-4">
                <div className="flex items-start gap-3 mb-3">
                  <Badge variant={position.side === 'YES' ? 'success' : 'danger'}>{position.side}</Badge>
                  <p className="text-sm text-[var(--text-primary)] leading-tight">{position.marketQuestion}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-[var(--text-muted)]">Contracts</p>
                    <p className="font-mono text-[var(--text-primary)] font-semibold">{position.contracts}</p>
                  </div>
                  <div>
                    <p className="text-[var(--text-muted)]">Entry</p>
                    <p className="font-mono text-[var(--text-primary)] font-semibold">{formatPrice(position.entryPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[var(--text-muted)]">Current</p>
                    <p className="font-mono text-[var(--text-primary)] font-semibold">{formatPrice(position.currentPrice)}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border mb-5"
                style={{ borderColor: pnlPositive ? 'rgba(126,168,150,0.3)' : 'rgba(196,125,110,0.3)',
                         background: pnlPositive ? 'var(--success-dim)' : 'var(--danger-dim)' }}>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Proceeds from exit</p>
                  <p className="text-xl font-mono font-bold text-[var(--text-primary)]">{formatUSD(position.currentValue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)]">P&L</p>
                  <p className={`text-lg font-mono font-bold ${pnlPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {pnlPositive ? '+' : ''}{formatUSD(position.pnl)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-[var(--warning)]/10 rounded-lg border border-[var(--warning)]/20 mb-5">
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] mt-0.5 flex-shrink-0" />
                <p className="text-xs text-[var(--warning)]">This will close your position at the current market price.</p>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="md" onClick={onClose} className="flex-1">Cancel</Button>
                <Button variant="danger" size="md" onClick={onClose} className="flex-1">Exit Position</Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
