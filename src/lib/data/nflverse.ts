import { parseCsv, num } from "./csv.ts";

/**
 * nflverse weekly player stats, free, public, no key.
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

export interface NflverseInjuryReport {
  season: string;
  seasonType: string;
  team: string;
  week: number;
  gsisId: string;
  position: string | null;
  fullName: string;
  injuryText: string;
  reportStatus: string | null;
}

export interface NflverseParticipation {
  season: string;
  week: number;
  gsisIds: string[];
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
    // Regular season only, postseason usage doesn't predict next-season roles.
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

export async function fetchInjuryReports(season: string): Promise<NflverseInjuryReport[]> {
  const rows = await fetchReleaseCsv(`injuries/injuries_${season}.csv`, `injuries for ${season}`);

  return rows.flatMap((row) => {
    const week = num(row.week);
    const gsisId = row.gsis_id ?? "";
    if ((row.game_type ?? "REG") !== "REG" || week == null || !gsisId) return [];
    if (!FANTASY_POSITIONS.has(row.position ?? "")) return [];

    const injuryText = [
      row.report_primary_injury,
      row.report_secondary_injury,
      row.practice_primary_injury,
      row.practice_secondary_injury,
    ]
      .filter(Boolean)
      .join(" — ");

    return [{
      season: row.season ?? season,
      seasonType: row.game_type ?? "REG",
      team: row.team ?? "",
      week,
      gsisId,
      position: row.position || null,
      fullName: row.full_name || gsisId,
      injuryText,
      reportStatus: row.report_status || null,
    }];
  });
}

/** One row per week with every player who logged an offense, defense or special-teams snap. */
export async function fetchParticipation(season: string): Promise<NflverseParticipation[]> {
  const rosterRows = await fetchReleaseCsv(
    `weekly_rosters/roster_weekly_${season}.csv`,
    `weekly rosters for ${season}`,
  );
  const snapRows = await fetchReleaseCsv(
    `snap_counts/snap_counts_${season}.csv`,
    `snap counts for ${season}`,
  );
  const gsisIdByPfrId = new Map<string, string>();
  for (const row of rosterRows) {
    if (row.pfr_id && row.gsis_id) gsisIdByPfrId.set(row.pfr_id, row.gsis_id);
  }

  const byWeek = new Map<number, Set<string>>();
  for (const row of snapRows) {
    const week = num(row.week);
    const gsisId = gsisIdByPfrId.get(row.pfr_player_id ?? "") ?? "";
    const totalSnaps =
      (num(row.offense_snaps) ?? 0) +
      (num(row.defense_snaps) ?? 0) +
      (num(row.st_snaps) ?? 0);
    if ((row.game_type ?? "REG") !== "REG" || week == null || !gsisId || totalSnaps === 0) {
      continue;
    }
    const ids = byWeek.get(week) ?? new Set<string>();
    ids.add(gsisId);
    byWeek.set(week, ids);
  }

  return [...byWeek].map(([week, ids]) => ({ season, week, gsisIds: [...ids] }));
}

/**
 * Every NFL game, used to derive bye weeks (see core/schedule.ts).
 * One file covers all seasons, so it's fetched once and filtered.
 */
export async function fetchSchedule(): Promise<
  { season: string; week: number; gameType: string; awayTeam: string; homeTeam: string }[]
> {
  const res = await fetch(`${RELEASE_BASE}/schedules/games.csv`, {
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`nflverse schedule returned ${res.status}.`);

  return parseCsv(await res.text())
    .map((row) => ({
      season: row.season ?? "",
      week: num(row.week) ?? 0,
      gameType: row.game_type ?? "REG",
      awayTeam: row.away_team ?? "",
      homeTeam: row.home_team ?? "",
    }))
    .filter((g) => g.season && g.week > 0 && g.awayTeam && g.homeTeam);
}

async function fetchReleaseCsv(path: string, description: string): Promise<Record<string, string>[]> {
  const res = await fetch(`${RELEASE_BASE}/${path}`, {
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`nflverse returned ${res.status} for ${description}.`);
  return parseCsv(await res.text());
}
