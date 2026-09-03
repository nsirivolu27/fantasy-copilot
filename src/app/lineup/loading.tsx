export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-64 animate-pulse rounded-md bg-white/5" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded bg-white/5" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-white/5" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl bg-white/5" />
      ))}
      <p className="text-center text-xs text-[var(--muted)]">
        Optimizing your lineup…
      </p>
    </div>
  );
}
