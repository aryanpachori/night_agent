export default function MarketsLoading() {
  return (
    <div className="p-6 space-y-5">
      <div className="relative h-[52px] max-w-xl overflow-hidden rounded-lg bg-[var(--bg-card)]">
        <div className="loading-shimmer" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="relative h-[220px] overflow-hidden rounded-xl bg-[var(--bg-card)]">
            <div className="loading-shimmer" />
          </div>
        ))}
      </div>
    </div>
  )
}
