export default function MarketDetailLoading() {
  return (
    <div className="space-y-5 p-6">
      <div className="relative h-6 w-40 overflow-hidden rounded bg-[var(--bg-card)]">
        <div className="loading-shimmer" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="relative col-span-2 min-h-[420px] overflow-hidden rounded-xl bg-[var(--bg-card)] lg:col-span-2">
          <div className="loading-shimmer" />
        </div>
        <div className="space-y-4">
          <div className="relative h-[280px] overflow-hidden rounded-xl bg-[var(--bg-card)]">
            <div className="loading-shimmer" />
          </div>
          <div className="relative h-[160px] overflow-hidden rounded-xl bg-[var(--bg-card)]">
            <div className="loading-shimmer" />
          </div>
        </div>
      </div>
    </div>
  )
}
