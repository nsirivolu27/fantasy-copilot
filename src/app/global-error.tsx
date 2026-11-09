"use client";

/** Catches errors thrown in the root layout itself, so it ships its own <html>. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#0a0a0b",
          color: "#ededf0",
          fontFamily: "system-ui, sans-serif",
          padding: "3rem 1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1rem", fontWeight: 600 }}>Fantasy Copilot failed to start</h1>
        <p style={{ marginTop: ".5rem", fontSize: ".875rem", opacity: 0.7 }}>
          This usually means the database is unreachable. Check DATABASE_URL, then reload.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: "1.5rem",
            background: "#22c55e",
            color: "#000",
            border: 0,
            borderRadius: ".5rem",
            padding: ".5rem 1rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
