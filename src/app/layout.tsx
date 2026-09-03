import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fantasy Copilot",
  description: "A free companion for your fantasy football league.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Applies a stored theme override before first paint, so a viewer who
          chose dark never sees a white flash on load.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("fc-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-dvh">
        <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-md bg-[var(--accent-weak)] text-[var(--accent)]">
                ▲
              </span>
              Fantasy Copilot
            </Link>
            <div className="flex items-center gap-2">
              <Nav />
              <ThemeToggle />
            </div>
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
