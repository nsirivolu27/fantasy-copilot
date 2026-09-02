import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fantasy Copilot",
  description: "A free companion for your fantasy football league.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-md bg-[var(--accent)]/15 text-[var(--accent)]">
                ▲
              </span>
              Fantasy Copilot
            </Link>
            <div className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
              >
                League
              </Link>
              <Link
                href="/chat"
                className="rounded-md px-3 py-1.5 text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
              >
                Chat
              </Link>
              <Link
                href="/settings"
                className="rounded-md px-3 py-1.5 text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
              >
                Settings
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 pb-20">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-[var(--muted)]">
          Phase 1 — league sync only. Projections, waivers, trades and chat come later.
        </footer>
      </body>
    </html>
  );
}
