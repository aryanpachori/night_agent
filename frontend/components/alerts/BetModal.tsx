'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { usePlaceBet } from '@/hooks/usePositions'
import { useWallet } from '@/hooks/useWallet'
import { api } from '@/lib/api'

type AlertRow = {
  id: string
  marketId: string
  marketQuestion: string
  category?: string
  side: 'YES' | 'NO'
  marketPrice?: number
  aiConfidencePct?: number
  eventName?: string
  betAmountUsd?: number
}

interface BetModalProps {
  alert: AlertRow | null
  onClose: () => void
  onSuccess: () => void
}

export function BetModal({ alert, onClose, onSuccess }: BetModalProps) {
  const { data: walletData } = useWallet()
  const placeBet = usePlaceBet()
  const qc = useQueryClient()

  const balance = Number(walletData?.balance ?? 0)
  const suggested = Number(alert?.betAmountUsd ?? 10)
  const [amount, setAmount] = useState(Math.max(1, suggested))
  const [loading, setLoading] = useState(false)

  if (!alert) return null
  const currentAlert = alert

  const price = Number(currentAlert.marketPrice ?? 0.5)
  const contracts = price > 0 ? Math.floor(amount / price) : 0
  const actualCost = contracts * price
  const potentialPayout = contracts
  const potentialProfit = potentialPayout - actualCost

  async function handleConfirm() {
    if (actualCost <= 0 || actualCost > balance) return
    setLoading(true)
    try {
      const pos = await placeBet.mutateAsync({
        marketId: currentAlert.marketId,
        marketQuestion: currentAlert.marketQuestion,
        category: currentAlert.category,
        side: currentAlert.side,
        entryPrice: price,
        amount: actualCost,
      })

      await api.patch(`/api/alerts/${currentAlert.id}`, {
        actionTaken: 'bet_full',
        positionId: pos?.position?.id ?? null,
      })

      await Promise.all([
        qc.invalidateQueries({ queryKey: ['alerts'] }),
        qc.invalidateQueries({ queryKey: ['positions'] }),
        qc.invalidateQueries({ queryKey: ['wallet'] }),
      ])

      toast.success(`Bet placed — $${actualCost.toFixed(2)}`)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Failed to place bet')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0.0, 0.0, 0.2, 1] }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border-bright)] bg-[var(--bg-card)] shadow-2xl">
          <div className="border-b border-[var(--border)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs text-[var(--text-muted)]">Placing bet on</p>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  {currentAlert.eventName ?? currentAlert.marketQuestion?.slice(0, 50)}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="ml-2 min-h-10 min-w-10 rounded-md text-xl leading-none text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label="Close bet modal"
              >
                ×
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-[var(--bg-secondary)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${currentAlert.aiConfidencePct ?? 50}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-[var(--accent)]">
                {currentAlert.aiConfidencePct ?? 50}% chance
              </span>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">How much to bet?</p>
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                {[5, 10, 20, 50].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setAmount(amt)}
                    disabled={amt > balance}
                    className={`min-h-10 rounded-lg border py-1.5 text-xs font-medium transition-colors disabled:opacity-30 ${
                      amount === amt
                        ? 'border-[var(--accent)]/30 bg-[var(--accent-glow)] text-[var(--accent)]'
                        : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5 focus-within:border-[var(--accent)]/50">
                <span className="mr-1 text-sm text-[var(--text-muted)]">$</span>
                <input
                  type="number"
                  min={1}
                  max={Math.floor(balance)}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(1, Number(e.target.value || 0)))}
                  className="flex-1 bg-transparent text-lg font-bold text-[var(--text-primary)] outline-none"
                  autoFocus
                  aria-label="Bet amount"
                />
                <span className="text-xs text-[var(--text-muted)]">/ ${balance.toFixed(0)} available</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--success)]/20 bg-[var(--success-dim)] p-3 text-center">
                <p className="mb-1 text-xs text-[var(--success)]">If right</p>
                <p className="text-lg font-bold text-[var(--success)]">+${Math.max(0, potentialProfit).toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-dim)] p-3 text-center">
                <p className="mb-1 text-xs text-[var(--danger)]">If wrong</p>
                <p className="text-lg font-bold text-[var(--danger)]">-${actualCost.toFixed(2)}</p>
              </div>
            </div>

            {actualCost > balance && (
              <p className="text-center text-xs text-[var(--danger)]">Not enough balance for this amount</p>
            )}

            <button
              onClick={() => void handleConfirm()}
              disabled={loading || actualCost <= 0 || actualCost > balance || contracts === 0}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3.5 text-sm font-bold text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Placing bet...' : `Confirm — Bet $${actualCost.toFixed(2)}`}
            </button>

            <button
              onClick={onClose}
              className="min-h-10 w-full py-2 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
