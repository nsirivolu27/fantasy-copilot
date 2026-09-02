import * as React from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--panel)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Badge({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}
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
  tone?: "info" | "warn" | "error" | "success";
  title: string;
  children?: React.ReactNode;
}) {
  const tones = {
    info: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  } as const;
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-sm ${tones[tone]}`}>
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
    <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--muted)]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg bg-[var(--panel-2)] px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}
