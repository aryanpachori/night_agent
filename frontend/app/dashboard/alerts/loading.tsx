export default function AlertsLoading() {
  return (
    <div className="p-6 space-y-5">
      <div className="relative h-[220px] overflow-hidden rounded-xl bg-[var(--bg-card)]">
        <div className="loading-shimmer" />
      </div>
      <div className="relative min-h-[320px] overflow-hidden rounded-xl bg-[var(--bg-card)]">
        <div className="loading-shimmer" />
      </div>
    </div>
  )
}
