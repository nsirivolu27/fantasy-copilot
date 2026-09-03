import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center">
      <p className="text-sm font-medium">Page not found</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--muted)]">
        That route doesn&apos;t exist yet, it may belong to a phase that isn&apos;t built.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)]"
      >
        Back to your league
      </Link>
    </div>
  );
}
