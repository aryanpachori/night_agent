export function getDirectionLabel(side: string): { label: string; color: string } {
  return side === "NO"
    ? { label: "↓ Going DOWN", color: "text-[var(--danger)]" }
    : { label: "↑ Going UP", color: "text-[var(--success)]" }
}

export function getConfidenceLabel(level: string): { label: string; color: string } {
  if (level === "high") return { label: "✅ High confidence", color: "text-[var(--success)]" }
  if (level === "medium") return { label: "⚡ Moderate confidence", color: "text-[var(--warning)]" }
  return { label: "⚠️ Lower confidence", color: "text-[var(--text-muted)]" }
}
