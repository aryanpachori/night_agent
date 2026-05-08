'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'

const PLAN_ID = 'pro_monthly'

function PricingContent() {
  const { user, refetchUser } = useAuth()
  const searchParams = useSearchParams()
  const [checkingOut, setCheckingOut] = useState(false)
  const [openingManage, setOpeningManage] = useState(false)
  const [confirmingReturn, setConfirmingReturn] = useState(false)
  const processedReturnRef = useRef<string | null>(null)

  const isPro = String(user?.planTier || 'free').toLowerCase() === 'pro'

  useEffect(() => {
    const source = searchParams.get('source')
    if (source !== 'dodo' || confirmingReturn) return

    const status = searchParams.get('status') || ''
    const subscriptionId = searchParams.get('subscription_id') || ''
    const paymentId = searchParams.get('payment_id') || ''
    if (!status && !subscriptionId && !paymentId) return
    const returnKey = `${status}:${subscriptionId}:${paymentId}`
    if (processedReturnRef.current === returnKey) return

    processedReturnRef.current = returnKey
    setConfirmingReturn(true)
    void api
      .post('/api/subscriptions/confirm-return', {
        status,
        subscriptionId,
        paymentId,
      })
      .then(async (res) => {
        if (String(res.data?.planTier || '').toLowerCase() === 'pro') {
          await refetchUser()
          toast.success('Payment confirmed! Your Pro plan is now active.')
        } else {
          toast('Payment received. Subscription activation is processing.', { icon: '⏳' })
        }
      })
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        toast.error(msg || 'Payment return received, but activation could not be confirmed yet.')
      })
      .finally(() => setConfirmingReturn(false))
  }, [searchParams, confirmingReturn, refetchUser])

  const handleCheckout = async () => {
    if (!user) {
      window.location.href = '/login'
      return
    }
    setCheckingOut(true)
    try {
      const { data } = await api.post('/api/subscriptions/checkout', { planId: PLAN_ID })
      if (!data?.checkoutUrl) throw new Error('Missing checkout URL')
      window.location.href = data.checkoutUrl
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Failed to start checkout')
    } finally {
      setCheckingOut(false)
    }
  }

  const handleManage = async () => {
    if (!user) {
      window.location.href = '/login'
      return
    }
    setOpeningManage(true)
    try {
      const { data } = await api.get('/api/subscriptions/manage')
      if (!data?.manageUrl) throw new Error('Missing manage URL')
      window.open(data.manageUrl, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Failed to open subscription manager')
    } finally {
      setOpeningManage(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">NightAgent Pro</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Test mode only · No real money · Powered by Dodo Payments
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-[var(--accent-bright)] hover:opacity-80">
          Back to dashboard
        </Link>
      </div>

      <Card className="p-6">
        <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Plan</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Pro Monthly — $12</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Built for part-time traders who want faster, cleaner signal flow without constantly monitoring multiple channels.
        </p>

        <div className="mt-5 space-y-2 text-sm text-[var(--text-secondary)]">
          <p>• Priority alerts (higher daily cap + faster alert cadence)</p>
          <p>• Advanced category selection (Tech, Culture, US Elections)</p>
          <p>• Keep all existing free features</p>
        </div>

        <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-sm">
          <p className="text-[var(--text-secondary)]">
            Current plan:{' '}
            <span className="font-semibold text-[var(--text-primary)]">
              {isPro ? 'Pro' : 'Free'}
            </span>
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Status: {String(user?.planStatus || 'inactive')}
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            This checkout runs in test mode only. No real-money charges are made.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" loading={checkingOut} onClick={() => void handleCheckout()}>
            {isPro ? 'Renew / Re-open checkout' : 'Upgrade to Pro'}
          </Button>
          <Button variant="secondary" size="sm" loading={openingManage} onClick={() => void handleManage()}>
            Manage subscription
          </Button>
        </div>
      </Card>
    </main>
  )
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10">
          <Card className="p-6">
            <p className="text-sm text-[var(--text-muted)]">Loading pricing...</p>
          </Card>
        </main>
      }
    >
      <PricingContent />
    </Suspense>
  )
}
