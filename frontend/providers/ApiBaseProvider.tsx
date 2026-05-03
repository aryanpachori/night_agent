'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { api } from '@/lib/api'

const FALLBACK = 'http://localhost:4000'

export function normalizeApiBaseUrl(raw: string | undefined): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/\/$/, '')
  return FALLBACK
}

const ApiBaseContext = createContext<string>(FALLBACK)

export function useApiBase(): string {
  return useContext(ApiBaseContext)
}

/**
 * Reads NEXT_PUBLIC_API_URL on the server (layout) and syncs axios + context on the client
 * so deployed builds always match current Vercel env, not stale build-time inlining.
 */
export function ApiBaseProvider({ apiBase, children }: { apiBase: string; children: ReactNode }) {
  const base = useMemo(() => normalizeApiBaseUrl(apiBase), [apiBase])
  api.defaults.baseURL = base
  return <ApiBaseContext.Provider value={base}>{children}</ApiBaseContext.Provider>
}
