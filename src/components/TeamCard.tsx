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
}

export function TeamCard(props: TeamCardProps) {
  const [open, setOpen] = useState(props.isMine);
  const total = props.starters.length + props.bench.length;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-[var(--panel)] ${
        props.isMine ? "border-[var(--accent)]/50" : "border-[var(--border)]"
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{props.name}</p>
            {props.isMine ? (
              <Badge className="bg-[var(--accent)]/15 text-[var(--accent)] ring-[var(--accent)]/30">
                My team
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
            {props.ownerName ?? "Unknown manager"} · {props.record} · {props.pointsFor.toFixed(2)} PF ·{" "}
            {props.pointsAgainst.toFixed(2)} PA
          </p>
        </div>
        <span className="shrink-0 text-xs text-[var(--muted)]">{total}</span>
        <span
          className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ›
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
          <li key={r.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
            <span className="w-14 shrink-0 text-[11px] font-medium text-[var(--muted)]">
              {r.slotLabel}
            </span>
            <Badge className={r.positionColor}>{r.position ?? "—"}</Badge>
            <span className="min-w-0 flex-1 truncate text-sm">{r.playerName}</span>
            {r.injuryStatus ? (
              <Badge className="bg-rose-500/15 text-rose-300 ring-rose-500/30" title="Injury status">
                {r.injuryStatus}
              </Badge>
            ) : null}
            <span className="w-9 shrink-0 text-right text-[11px] text-[var(--muted)]">
              {r.nflTeam ?? "FA"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
