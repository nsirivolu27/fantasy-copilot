"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";

export interface RosterRow {
  id: string;
  slot: string;
  slotLabel: string;
  isStarter: boolean;
  playerName: string;
  position?: string | null;
  nflTeam?: string | null;
  injuryStatus?: string | null;
  positionColor: string;
  projectedPoints?: number | null;
  floor?: number | null;
  ceiling?: number | null;
  confidence?: number | null;
}

export interface TeamCardProps {
  name: string;
  ownerName?: string | null;
  record: string;
  pointsFor: number;
  pointsAgainst: number;
  isMine: boolean;
  starters: RosterRow[];
  bench: RosterRow[];
  projectedTotal?: number | null;
}

export function TeamCard(props: TeamCardProps) {
  const [open, setOpen] = useState(props.isMine);
  const total = props.starters.length + props.bench.length;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-[var(--panel)] ${
        props.isMine ? "border-[var(--accent)]" : "border-[var(--border)]"
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hoverable"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{props.name}</p>
            {props.isMine ? (
              <Badge tone="accent">
                My team
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
            {props.ownerName ?? "Unknown manager"} · {props.record} · {props.pointsFor.toFixed(2)} PF ·{" "}
            {props.pointsAgainst.toFixed(2)} PA
          </p>
        </div>
        {props.projectedTotal != null ? (
          <span
            className="shrink-0 text-xs text-[var(--muted)]"
            title="Projected points from the starting lineup"
          >
            {props.projectedTotal.toFixed(1)} proj
          </span>
        ) : (
          <span className="shrink-0 text-xs text-[var(--muted)]">{total}</span>
        )}
        <span
          className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          &gt;
        </span>
      </button>

      {open ? (
        <div className="border-t border-[var(--border)] px-2 py-2">
          {total === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-[var(--muted)]">
              No players on this roster yet.
            </p>
          ) : (
            <>
              <RosterSection label="Starters" rows={props.starters} />
              <RosterSection label="Bench" rows={props.bench} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RosterSection({ label, rows }: { label: string; rows: RosterRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-1">
      <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hoverable">
            <span className="w-14 shrink-0 text-[11px] font-medium text-[var(--muted)]">
              {r.slotLabel}
            </span>
            <Badge className={r.positionColor}>{r.position ?? "-"}</Badge>
            <span className="min-w-0 flex-1 truncate text-sm">{r.playerName}</span>
            {r.injuryStatus ? (
              <Badge tone="bad" title="Injury status">
                {r.injuryStatus}
              </Badge>
            ) : null}
            <span className="w-8 shrink-0 text-right text-[11px] text-[var(--muted)]">
              {r.nflTeam ?? "FA"}
            </span>
            {r.projectedPoints != null ? (
              <span
                className="w-14 shrink-0 text-right"
                title={
                  r.floor != null && r.ceiling != null
                    ? `Floor ${r.floor.toFixed(1)}, ceiling ${r.ceiling.toFixed(1)}`
                    : undefined
                }
              >
                <span className="text-[13px] font-semibold tabular-nums">
                  {r.projectedPoints.toFixed(1)}
                </span>
                {r.confidence != null ? (
                  <span
                    className={`ml-1 text-[10px] ${
                      r.confidence >= 0.66
                        ? "text-[var(--good-fg)]"
                        : r.confidence >= 0.4
                          ? "text-[var(--warn-fg)]"
                          : "text-[var(--faint)]"
                    }`}
                    title={`Confidence ${(r.confidence * 100).toFixed(0)}%`}
                  >
                    ●
                  </span>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
