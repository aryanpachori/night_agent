export default function PositionsLoading() {
  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="relative h-[88px] overflow-hidden rounded-xl bg-[var(--bg-card)]">
            <div className="loading-shimmer" />
          </div>
        ))}
      </div>
      <div className="relative h-[280px] overflow-hidden rounded-xl bg-[var(--bg-card)]">
        <div className="loading-shimmer" />
      </div>
    </div>
  )
}
