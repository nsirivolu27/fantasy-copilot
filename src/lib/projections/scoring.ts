/**
 * Scores an nflverse stat line using a league's own Sleeper scoring settings.
 *
 * This is the step that makes the app format-agnostic: half-PPR, full PPR, TE
 * premium, 6-point passing TDs all fall out of the league's own JSON. Nothing
 * about scoring is hardcoded, the settings arrive from the league sync.
 *
 * Pure and dependency-free so it can be unit tested.
 */

export type StatLine = Record<string, number | null | undefined>;

/**
 * Maps a Sleeper scoring key to the nflverse column(s) that produce it.
 * A key mapped to several columns is summed (fumbles lost, for example, are
 * split across three columns in nflverse).
 */
const STAT_SOURCES: Record<string, string[]> = {
  pass_yd: ["passing_yards"],
  pass_td: ["passing_tds"],
  pass_int: ["interceptions"],
  pass_2pt: ["passing_2pt_conversions"],
  pass_fd: ["passing_first_downs"],
  pass_sack: ["sacks"],

  rush_yd: ["rushing_yards"],
  rush_td: ["rushing_tds"],
  rush_2pt: ["rushing_2pt_conversions"],
  rush_fd: ["rushing_first_downs"],
  rush_att: ["carries"],

  rec: ["receptions"],
  rec_yd: ["receiving_yards"],
  rec_td: ["receiving_tds"],
  rec_2pt: ["receiving_2pt_conversions"],
  rec_fd: ["receiving_first_downs"],
  rec_tgt: ["targets"],

  fum_lost: ["sack_fumbles_lost", "rushing_fumbles_lost", "receiving_fumbles_lost"],
  fum: ["sack_fumbles", "rushing_fumbles", "receiving_fumbles"],
};

/** Position-restricted bonuses: key -> [column, position that earns it]. */
const POSITION_BONUSES: Record<string, { column: string; position: string }> = {
  bonus_rec_te: { column: "receptions", position: "TE" },
  bonus_rec_rb: { column: "receptions", position: "RB" },
  bonus_rec_wr: { column: "receptions", position: "WR" },
};

export interface ScoreResult {
  points: number;
  /** Scoring keys the league defines that this stat line can't produce. */
  unsupportedKeys: string[];
}

export function scoreStatLine(
  stats: StatLine,
  scoringSettings: Record<string, number>,
  position?: string,
): ScoreResult {
  let points = 0;
  const unsupportedKeys: string[] = [];

  for (const [key, value] of Object.entries(scoringSettings)) {
    if (!value) continue; // a rule worth 0 points can't change anything

    const bonus = POSITION_BONUSES[key];
    if (bonus) {
      if (position === bonus.position) points += value * numberOf(stats[bonus.column]);
      continue;
    }

    const columns = STAT_SOURCES[key];
    if (!columns) {
      // Defense/kicker rules and yardage-threshold bonuses aren't computable
      // from the skill-position weekly file. Report rather than silently drop.
      unsupportedKeys.push(key);
      continue;
    }

    let total = 0;
    for (const column of columns) total += numberOf(stats[column]);
    points += value * total;
  }

  return { points: round2(points), unsupportedKeys };
}

function numberOf(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
