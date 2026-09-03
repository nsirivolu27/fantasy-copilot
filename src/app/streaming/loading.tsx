export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-64 skeleton rounded-md" />
      <div className="h-4 w-80 max-w-full skeleton rounded" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 skeleton rounded-lg" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-40 skeleton rounded-xl" />
      ))}
      <p className="text-center text-xs text-[var(--muted)]">
        Projecting free agents against your league&apos;s scoring — this takes a few seconds.
      </p>
    </div>
  );
}
