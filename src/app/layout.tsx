import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
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
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-md bg-[var(--accent)]/15 text-[var(--accent)]">
                ▲
              </span>
              Fantasy Copilot
            </Link>
            <Nav />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 pb-20">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-[var(--muted)]">
          Free, self-hosted, and honest about its own accuracy — see the{" "}
          <Link href="/model" className="underline hover:text-[var(--text)]">
            model report card
          </Link>
          .
        </footer>
      </body>
    </html>
  );
}
