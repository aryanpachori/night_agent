'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { scaleIn, fadeIn } from '@/lib/animations'
import { formatUSD, formatPrice } from '@/lib/utils'

export interface ExitModalPosition {
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
  position: ExitModalPosition | null
  onConfirm: (closePrice: number) => Promise<void>
  loading?: boolean
}

export function ExitModal({ isOpen, onClose, position, onConfirm, loading }: ExitModalProps) {
  const [closePriceStr, setClosePriceStr] = useState('')

  useEffect(() => {
    if (position && isOpen) {
      setClosePriceStr(String(position.currentPrice))
    }
  }, [position, isOpen])

  if (!position) return null

  const closePrice = Number(closePriceStr)
  const validPrice = Number.isFinite(closePrice) && closePrice >= 0 && closePrice <= 1
  const pnlPositive = position.pnl >= 0

  async function handleConfirm() {
    if (!validPrice) return
    try {
      await onConfirm(closePrice)
      onClose()
    } catch {
      /* mutation surfaces toast */
    }
  }

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
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          >
            <div className="pointer-events-auto mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border-bright)] bg-[var(--bg-card)] p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Exit Position</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-4 rounded-xl bg-[var(--bg-secondary)] p-4">
                <div className="mb-3 flex items-start gap-3">
                  <Badge variant={position.side === 'YES' ? 'success' : 'danger'}>{position.side}</Badge>
                  <p className="text-sm leading-tight text-[var(--text-primary)]">{position.marketQuestion}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-[var(--text-muted)]">Contracts</p>
                    <p className="font-mono font-semibold text-[var(--text-primary)]">{position.contracts}</p>
                  </div>
                  <div>
                    <p className="text-[var(--text-muted)]">Entry</p>
                    <p className="font-mono font-semibold text-[var(--text-primary)]">
                      {formatPrice(position.entryPrice)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--text-muted)]">Mark price</p>
                    <p className="font-mono font-semibold text-[var(--text-primary)]">
                      {formatPrice(position.currentPrice)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <Input
                  label="Exit price (YES probability 0–1)"
                  value={closePriceStr}
                  onChange={(e) => setClosePriceStr(e.target.value)}
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                />
              </div>

              <div
                className="mb-5 flex items-center justify-between rounded-xl border p-4"
                style={{
                  borderColor: pnlPositive ? 'rgba(126,168,150,0.3)' : 'rgba(196,125,110,0.3)',
                  background: pnlPositive ? 'var(--success-dim)' : 'var(--danger-dim)',
                }}
              >
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Model proceeds</p>
                  <p className="text-xl font-mono font-bold text-[var(--text-primary)]">
                    {formatUSD(position.currentValue)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)]">Unrealized P&L</p>
                  <p
                    className={`text-lg font-mono font-bold ${pnlPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                  >
                    {pnlPositive ? '+' : ''}
                    {formatUSD(position.pnl)}
                  </p>
                </div>
              </div>

              <div className="mb-5 flex items-start gap-2 rounded-lg border border-[var(--warning)]/20 bg-[var(--warning)]/10 p-3">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--warning)]" />
                <p className="text-xs text-[var(--warning)]">
                  Closing uses your exit price to settle paper P&amp;L on the server.
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="md" onClick={onClose} className="flex-1" disabled={loading}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  onClick={() => void handleConfirm()}
                  className="flex-1"
                  disabled={loading || !validPrice}
                >
                  {loading ? 'Closing…' : 'Exit Position'}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
