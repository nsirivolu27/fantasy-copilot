"use client";

import { useState } from "react";

/**
 * The digest is only useful if it leaves the app, so the primary action is
 * copying it as plain text for a group chat.
 */
export function DigestCopy({
  lines,
  leagueName,
  week,
}: {
  lines: { title: string; detail: string }[];
  leagueName: string;
  week: number;
}) {
  const [copied, setCopied] = useState(false);

  const text = [`${leagueName}, week ${week}`, "", ...lines.map((l) => `${l.title}: ${l.detail}`)].join(
    "\n",
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the text is selectable below anyway.
      setCopied(false);
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="text-sm">
            <span className="font-medium">{l.title}</span>
            <span className="text-[var(--muted)]">, {l.detail}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={copy}
        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm transition hoverable"
      >
        {copied ? "Copied" : "Copy for the group chat"}
      </button>
      <textarea
        readOnly
        value={text}
        rows={3}
        aria-label="Digest text"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2 font-mono text-[11px] text-[var(--muted)]"
      />
    </div>
  );
}
