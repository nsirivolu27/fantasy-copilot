"use client";

import { useEffect, useRef, useState } from "react";

interface ToolCallTrace {
  name: string;
  summary: string;
}

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  tools?: ToolCallTrace[];
  provider?: string;
  error?: boolean;
}

const SUGGESTIONS = [
  "Who's on my roster?",
  "What are the scoring settings?",
  "Who has the best record?",
  "Which team rosters Travis Kelce?",
  "Is anyone on my team injured?",
];

export function Chat({ ready }: { ready: boolean }) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    setEntries((e) => [...e, { role: "user", content: message }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, conversationId }),
      });
      const json = await res.json();

      if (!json.ok) {
        setEntries((e) => [...e, { role: "assistant", content: json.error, error: true }]);
      } else {
        setConversationId(json.conversationId);
        setEntries((e) => [
          ...e,
          {
            role: "assistant",
            content: json.answer,
            tools: json.toolTrace,
            provider: json.usedProvider,
          },
        ]);
      }
    } catch {
      setEntries((e) => [
        ...e,
        { role: "assistant", content: "Couldn't reach the server. Is it still running?", error: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {entries.length === 0 ? (
          <div className="pt-6">
            <p className="text-sm text-[var(--muted)]">
              Ask about your league. Every answer is grounded in your synced data — if the app
              doesn&apos;t have it, it says so instead of guessing.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={!ready || busy}
                  className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-white disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {entries.map((entry, i) => (
          <div key={i} className={entry.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                entry.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accent)]/15 px-3.5 py-2.5 text-sm"
                  : `max-w-[95%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm ${
                      entry.error
                        ? "border border-rose-500/30 bg-rose-500/10 text-rose-200"
                        : "bg-[var(--panel)]"
                    }`
              }
            >
              <p className="whitespace-pre-wrap leading-relaxed">{entry.content}</p>

              {entry.tools && entry.tools.length > 0 ? (
                <details className="mt-2 border-t border-[var(--border)] pt-2">
                  <summary className="cursor-pointer text-[11px] text-[var(--muted)]">
                    {entry.tools.length} tool call{entry.tools.length > 1 ? "s" : ""} — tap to inspect
                  </summary>
                  <ul className="mt-1.5 space-y-1.5">
                    {entry.tools.map((t, j) => (
                      <li key={j} className="rounded-md bg-[var(--panel-2)] p-2">
                        <p className="font-mono text-[11px] text-[var(--accent)]">{t.name}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">{t.summary}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {entry.provider ? (
                <p className="mt-1.5 text-[10px] text-[var(--muted)]">{entry.provider}</p>
              ) : null}
            </div>
          </div>
        ))}

        {busy ? (
          <div className="flex items-center gap-2 px-1 text-sm text-[var(--muted)]">
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
            Thinking…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-[var(--border)] pt-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!ready || busy}
          placeholder={ready ? "Ask about your league…" : "Sync a league and add a model first"}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!ready || busy || !input.trim()}
          className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
