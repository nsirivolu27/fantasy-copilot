import * as React from "react";

/** Semantic tones. Components name a role, never a colour. */
export type Tone = "good" | "warn" | "bad" | "info" | "neutral" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  good: "tint-good",
  warn: "tint-warn",
  bad: "tint-bad",
  info: "tint-info",
  neutral: "tint-neutral",
  accent: "tint-accent",
};

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-sm)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className = "",
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  /** Escape hatch for position tints (tint-qb, tint-rb, …). */
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
        className || TONE_CLASS[tone]
      }`}
    >
      {children}
    </span>
  );
}

export function Banner({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border px-3.5 py-3 text-sm ${TONE_CLASS[tone]}`}>
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-[13px] opacity-90">{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)] px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--muted)]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 shadow-[var(--shadow-sm)]">
      <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-[var(--faint)]">{hint}</p> : null}
    </div>
  );
}

/** The one primary action style, so buttons don't drift page to page. */
export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] transition hover:brightness-110"
    >
      {children}
    </a>
  );
}
