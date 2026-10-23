"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app]", error);
  }, [error]);

  return (
    <div className="rounded-xl border tint-bad p-6">
      <h1 className="text-base font-semibold text-[var(--bad-fg)]">Something broke on this page</h1>
      <p className="mt-1 text-sm text-[var(--bad-fg)]">
        Your synced data is safe, this is a rendering error, not a data loss.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-[var(--bad-fg)]">Reference: {error.digest}</p>
      ) : null}
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-[var(--bad-bg)] px-4 py-2 text-sm font-medium text-[var(--bad-fg)] transition hover:brightness-95"
      >
        Try again
      </button>
    </div>
  );
}
