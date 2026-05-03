'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface AuthUser {
  id: string
  firstName?: string | null
  username?: string | null
  photoUrl?: string | null
  authMethod?: string
  walletAddress?: string | null
  telegramId?: string | null
  categories: string[]
  riskMode: string
  maxAlertsPerDay: number
  alertIntervalMin?: number
  telegramAlerts?: boolean
  isPaused: boolean
  /** Auto-exit thresholds from PATCH /api/user (optional until first save) */
  autoTakeProfitPct?: number | null
  autoStopLossPct?: number | null
  wallet?: {
    balance: number
    totalPnl: number
    wins: number
    losses: number
    totalBets: number
  }
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  loginWithTelegram: (telegramData: Record<string, unknown>) => Promise<void>
  loginWithWallet: (publicKey: string, signature: string, message: string) => Promise<void>
  logout: () => Promise<void>
  refetchUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get<AuthUser>('/api/auth/me')
      setUser(data)
    } catch {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('nightagent_token')
      }
      setToken(null)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('nightagent_token')
    if (stored) {
      setToken(stored)
      void fetchMe()
    } else {
      setIsLoading(false)
    }
  }, [fetchMe])

  const loginWithTelegram = useCallback(
    async (telegramData: Record<string, unknown>) => {
      const { data } = await api.post<{ token: string }>('/api/auth/telegram', telegramData)
      localStorage.setItem('nightagent_token', data.token)
      setToken(data.token)
      await fetchMe()
      await qc.invalidateQueries()
    },
    [qc, fetchMe],
  )

  const loginWithWallet = useCallback(
    async (publicKey: string, signature: string, message: string) => {
      const { data } = await api.post<{ token: string }>('/api/auth/wallet', {
        publicKey,
        signature,
        message,
      })
      localStorage.setItem('nightagent_token', data.token)
      setToken(data.token)
      await fetchMe()
      await qc.invalidateQueries()
    },
    [qc, fetchMe],
  )

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {})
    localStorage.removeItem('nightagent_token')
    setToken(null)
    setUser(null)
    qc.clear()
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }, [qc])

  const refetchUser = useCallback(async () => {
    await fetchMe()
  }, [fetchMe])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        loginWithTelegram,
        loginWithWallet,
        logout,
        refetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider')
  return ctx
}
