import { parseCsv, num } from "./csv";

/**
 * nflverse weekly player stats — free, public, no key.
 * https://github.com/nflverse/nflverse-data/releases
 *
 * Column names below were read off the real 2024 file, not guessed. The parser
 * keeps the full row as JSON so later model versions can use columns this one
 * ignores without forcing a re-download.
 */
const RELEASE_BASE = "https://github.com/nflverse/nflverse-data/releases/download";

/** Only positions that can occupy a fantasy roster slot. */
const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

export interface NflverseWeek {
  gsisId: string;
  name: string;
  position: string;
  team: string | null;
  opponentTeam: string | null;
  season: string;
  week: number;
  seasonType: string;
  targets: number | null;
  targetShare: number | null;
  airYardsShare: number | null;
  wopr: number | null;
  carries: number | null;
  receptions: number | null;
  fantasyPointsPpr: number | null;
  raw: Record<string, string>;
}

export async function fetchWeeklyStats(season: string): Promise<NflverseWeek[]> {
  const url = `${RELEASE_BASE}/player_stats/player_stats_${season}.csv`;
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `nflverse has no stats file for ${season} yet (404). Early in a season this is normal.`
        : `nflverse returned ${res.status} for ${season}.`,
    );
  }

  const rows = parseCsv(await res.text());
  const out: NflverseWeek[] = [];

  for (const row of rows) {
    const position = row.position ?? "";
    if (!FANTASY_POSITIONS.has(position)) continue;
    // Regular season only — postseason usage doesn't predict next-season roles.
    if ((row.season_type ?? "REG") !== "REG") continue;
    const gsisId = row.player_id ?? "";
    const week = num(row.week);
    if (!gsisId || week == null) continue;

    out.push({
      gsisId,
      name: row.player_display_name || row.player_name || gsisId,
      position,
      team: row.recent_team || null,
      opponentTeam: row.opponent_team || null,
      season: row.season ?? season,
      week,
      seasonType: row.season_type ?? "REG",
      targets: num(row.targets),
      targetShare: num(row.target_share),
      airYardsShare: num(row.air_yards_share),
      wopr: num(row.wopr),
      carries: num(row.carries),
      receptions: num(row.receptions),
      fantasyPointsPpr: num(row.fantasy_points_ppr),
      raw: row,
    });
  }

  return out;
}
