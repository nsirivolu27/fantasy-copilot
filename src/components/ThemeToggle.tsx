"use client";

import { useEffect, useState } from "react";

type Choice = "light" | "dark" | "system";
const KEY = "fc-theme";

/**
 * Light is the default. This only stores an override, so a viewer who never
 * touches it follows their OS. The matching no-flash script lives in the
 * layout and runs before paint.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "light" || stored === "dark") setChoice(stored);
    } catch {
      // Private mode or blocked storage — the default is fine.
    }
  }, []);

  function apply(next: Choice) {
    setChoice(next);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Not being able to remember it is not worth surfacing.
    }
  }

  const next: Choice = choice === "dark" ? "light" : "dark";

  return (
    <button
      onClick={() => apply(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="hoverable grid size-8 shrink-0 place-items-center rounded-md border border-[var(--border)] text-[var(--muted)]"
    >
      <span aria-hidden className="text-[13px]">
        {choice === "dark" ? "☀" : "☾"}
      </span>
    </button>
  );
}
