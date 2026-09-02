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
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6">
      <h1 className="text-base font-semibold text-rose-200">Something broke on this page</h1>
      <p className="mt-1 text-sm text-rose-200/80">
        Your synced data is safe — this is a rendering error, not a data loss.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-rose-200/60">Reference: {error.digest}</p>
      ) : null}
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-rose-500/20 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/30"
      >
        Try again
      </button>
    </div>
  );
}
