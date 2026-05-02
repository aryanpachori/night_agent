export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="relative h-[120px] overflow-hidden rounded-xl bg-[var(--bg-card)]"
          >
            <div className="loading-shimmer" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="relative col-span-1 h-[300px] overflow-hidden rounded-xl bg-[var(--bg-card)] lg:col-span-2">
          <div className="loading-shimmer" />
        </div>
        <div className="relative h-[300px] overflow-hidden rounded-xl bg-[var(--bg-card)]">
          <div className="loading-shimmer" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="relative h-[220px] overflow-hidden rounded-xl bg-[var(--bg-card)]">
            <div className="loading-shimmer" />
          </div>
        ))}
      </div>
    </div>
  )
}
