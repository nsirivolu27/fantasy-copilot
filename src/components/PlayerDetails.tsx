"use client";

import type { NormalizedPlayer } from "@/lib/platforms/types";
import type { WeeklyPlayerData } from "@/lib/platforms/sleeper/playerStats";
import { scoreSleeperProjection } from "@/lib/core/playerScoring";

const number = (value: number | undefined) => value === undefined ? "—" : value.toFixed(2);
const labels: Record<string, string> = {
  pass_yd: "Passing yards", pass_td: "Passing touchdowns", pass_att: "Pass attempts", pass_cmp: "Completions",
  pass_int: "Interceptions thrown", rush_yd: "Rushing yards", rush_td: "Rushing touchdowns", rush_att: "Carries",
  rec: "Receptions", rec_yd: "Receiving yards", rec_td: "Receiving touchdowns", rec_tgt: "Targets",
  fum_lost: "Fumbles lost", sack: "Defensive sacks", int: "Defensive interceptions", pts_allow: "Points allowed",
  xpm: "Extra points made", fgmiss: "Field goals missed", pts_ppr: "Feed PPR points", pts_std: "Feed standard points",
  pts_half_ppr: "Feed half-PPR points", off_snp: "Offensive snaps", def_snp: "Defensive snaps",
};

export function PlayerDetails({ id, slot, starter, player, actual, weekly, scoring }: {
  id: string; slot: string; starter: boolean; player?: NormalizedPlayer; actual?: number;
  weekly: WeeklyPlayerData | null; scoring: Record<string, number>;
}) {
  const stats = weekly?.stats[id];
  const projected = weekly?.projections[id];
  const projection = projected ? scoreSleeperProjection(projected.stats, scoring, player?.position) : null;
  const keys = [...new Set([...Object.keys(stats?.stats ?? {}), ...Object.keys(projected?.stats ?? {})])].sort();
  if (id === "0") return <div className="dash-player"><span className="dash-slot">{slot}</span><strong>Empty slot</strong></div>;
  return <details className={`dash-player-details ${starter ? "" : "bench"}`}>
    <summary className="dash-player">
      <span className="dash-slot">{slot}</span>
      <div><strong>{player?.fullName ?? `Player ${id}`}</strong><small>{player?.position ?? ""} · {player?.nflTeam ?? stats?.team ?? projected?.team ?? "Team unavailable"}{(stats?.opponent ?? projected?.opponent) ? ` vs ${stats?.opponent ?? projected?.opponent}` : ""}</small>{player?.injuryStatus && <small className="dash-injury tint-warn">{player.injuryStatus} · current designation</small>}</div>
      <span className="dash-player-points"><small>Actual</small><strong>{number(actual)}</strong></span>
      <span className="dash-player-points"><small>Projected{projection?.unavailableKeys.length ? "*" : ""}</small><strong>{number(projection?.points)}</strong></span>
      <span aria-hidden="true">⌄</span>
    </summary>
    <div className="dash-player-breakdown">
      <p className="dash-fine">Actual points: Sleeper league matchup. Projection: Sleeper projected stats scored with this league’s settings; an estimate, not Copilot’s model or a live final-score forecast. {stats?.date ?? projected?.date ?? ""}</p>
      {projection && projection.unavailableKeys.length > 0 && <p className="dash-banner tint-warn">Partial projection: the feed omits these scoring bonuses or thresholds: {projection.unavailableKeys.join(", ")}. Displayed total excludes them.</p>}
      {keys.length ? <div className="dash-table-wrap"><table><thead><tr><th>Statistic</th><th>Actual</th><th>Projected</th><th>League multiplier</th><th>Projected points</th></tr></thead><tbody>{keys.map(key => <tr key={key}><th>{labels[key] ?? key.replaceAll("_", " ")}<small className="dash-fine">{key}</small></th><td>{number(stats?.stats[key])}</td><td>{number(projected?.stats[key])}</td><td>{key in scoring ? number(scoring[key]) : "—"}</td><td>{key in scoring && projected?.stats[key] !== undefined ? number(scoring[key] * projected.stats[key]) : "—"}</td></tr>)}</tbody></table></div> : <p className="dash-fine">No player stat line or projection is available for this week. Missing data is never treated as zero.</p>}
      {stats?.updated_at && <p className="dash-fine">Stats updated by Sleeper: {new Date(stats.updated_at).toLocaleString()}</p>}
    </div>
  </details>;
}
