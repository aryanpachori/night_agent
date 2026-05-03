/** Jupiter-style closeTime: seconds or ms unix timestamp */
export function daysLeftFromClose(closeTime: unknown): number {
  if (closeTime == null) return 0
  const raw = typeof closeTime === 'number' ? closeTime : Number(closeTime)
  if (!Number.isFinite(raw)) return 0
  const ms = raw > 1e12 ? raw : raw * 1000
  return Math.max(0, Math.ceil((ms - Date.now()) / 86400000))
}
