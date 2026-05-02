export default function LoginLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="relative h-[420px] w-full max-w-sm overflow-hidden rounded-2xl bg-[var(--bg-card)]">
        <div className="loading-shimmer" />
      </div>
    </div>
  )
}
