/** Shape returned by GET /api/positions (spread payload + promoted fields). */
export type UiOpenPosition = {
  id: string
  marketId: string
  marketQuestion: string
  eventName: string
  category: string
  side: 'YES' | 'NO'
  contracts: number
  entryPrice: number
  currentPrice: number
  totalCost: number
  currentValue: number
  pnl: number
  pnlPercent: number
  /** null = no close time set; 0 = closes today; >0 = days remaining */
  daysLeft: number | null
  hoursLeft: number | null
  timeLabel: string
  status: string
}

export type UiClosedPosition = {
  id: string
  marketQuestion: string
  category: string
  side: 'YES' | 'NO'
  contracts: number
  entryPrice: number
  closePrice: number
  totalCost: number
  pnl: number
  pnlPercent: number
  exitReason: string
  openedAt: Date
  closedAt: Date
}

export function normalizeOpenPosition(row: Record<string, unknown>): UiOpenPosition {
  const contracts = Number(row.contracts ?? 0)
  const entryPrice = Number(row.entryPrice ?? 0)
  const side: 'YES' | 'NO' = row.side === 'NO' ? 'NO' : 'YES'
  const currentPrice = Number(row.currentPrice ?? entryPrice)
  const totalCost = Number(row.totalCost ?? contracts * entryPrice)
  let currentValue = Number(row.currentValue)
  if (!Number.isFinite(currentValue)) {
    currentValue = contracts * currentPrice
  }
  let pnl = Number(row.pnl)
  if (!Number.isFinite(pnl)) {
    pnl = side === 'YES' ? (currentPrice - entryPrice) * contracts : (entryPrice - currentPrice) * contracts
  }
  const denom = totalCost || 1
  const pnlPercent = (pnl / denom) * 100

  return {
    id: String(row.id ?? ''),
    marketId: String(row.marketId ?? ''),
    marketQuestion: String(row.marketQuestion ?? ''),
    eventName: String(row.eventName ?? row.marketQuestion ?? 'Market event'),
    category: String(row.category ?? 'unknown'),
    side,
    contracts,
    entryPrice,
    currentPrice,
    totalCost,
    currentValue,
    pnl,
    pnlPercent,
    daysLeft: row.daysLeft != null ? Number(row.daysLeft) : null,
    hoursLeft: row.hoursLeft != null ? Number(row.hoursLeft) : null,
    timeLabel: String(row.timeLabel ?? '—'),
    status: String(row.status ?? 'open'),
  }
}

export function normalizeClosedPosition(row: Record<string, unknown>): UiClosedPosition {
  const contracts = Number(row.contracts ?? 0)
  const entryPrice = Number(row.entryPrice ?? 0)
  const closePrice = Number(row.closePrice ?? 0)
  const totalCost = Number(row.totalCost ?? contracts * entryPrice)
  const pnl = Number(row.pnl ?? 0)
  const denom = totalCost || 1
  const exitReason = String(row.exitReason ?? '')

  return {
    id: String(row.id ?? ''),
    marketQuestion: String(row.marketQuestion ?? ''),
    category: String(row.category ?? 'unknown'),
    side: row.side === 'NO' ? 'NO' : 'YES',
    contracts,
    entryPrice,
    closePrice,
    totalCost,
    pnl,
    pnlPercent: (pnl / denom) * 100,
    exitReason,
    openedAt: row.openedAt ? new Date(String(row.openedAt)) : new Date(),
    closedAt: row.closedAt ? new Date(String(row.closedAt)) : new Date(),
  }
}
