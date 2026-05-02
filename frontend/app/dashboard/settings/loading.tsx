export default function SettingsLoading() {
  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="relative h-[140px] overflow-hidden rounded-xl bg-[var(--bg-card)]">
            <div className="loading-shimmer" />
          </div>
        ))}
      </div>
    </div>
  )
}
