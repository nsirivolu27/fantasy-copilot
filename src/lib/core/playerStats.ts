/** A scored nflverse game, ready for display-oriented season aggregation. */
export interface PlayerGameStats {
  week: number;
  fantasyPoints: number;
  stats: Record<string, number>;
}

export interface PlayerStatTotal {
  key: string;
  label: string;
  value: number;
}

export interface PlayerStatSummary {
  gamesPlayed: number;
  seasonPoints: number;
  pointsPerGame: number;
  latestWeek: number;
  latestPoints: number;
  totals: PlayerStatTotal[];
}

const POSITION_STATS: Record<string, { key: string; label: string }[]> = {
  QB: [
    { key: "completions", label: "CMP" },
    { key: "attempts", label: "ATT" },
    { key: "passing_yards", label: "PASS YD" },
    { key: "passing_tds", label: "PASS TD" },
    { key: "interceptions", label: "INT" },
    { key: "carries", label: "CAR" },
    { key: "rushing_yards", label: "RUSH YD" },
    { key: "rushing_tds", label: "RUSH TD" },
  ],
  RB: skillPositionStats(),
  WR: skillPositionStats(),
  TE: skillPositionStats(),
};

export function summarizePlayerStats(
  position: string | null | undefined,
  games: PlayerGameStats[],
): PlayerStatSummary | null {
  if (games.length === 0) return null;

  const ordered = [...games].sort((a, b) => a.week - b.week);
  const latest = ordered[ordered.length - 1];
  const seasonPoints = round2(ordered.reduce((sum, game) => sum + game.fantasyPoints, 0));
  const wantedStats = POSITION_STATS[position ?? ""] ?? [];

  return {
    gamesPlayed: ordered.length,
    seasonPoints,
    pointsPerGame: round2(seasonPoints / ordered.length),
    latestWeek: latest.week,
    latestPoints: round2(latest.fantasyPoints),
    totals: wantedStats.map(({ key, label }) => ({
      key,
      label,
      value: round2(ordered.reduce((sum, game) => sum + (game.stats[key] ?? 0), 0)),
    })),
  };
}

function skillPositionStats(): { key: string; label: string }[] {
  return [
    { key: "carries", label: "CAR" },
    { key: "rushing_yards", label: "RUSH YD" },
    { key: "rushing_tds", label: "RUSH TD" },
    { key: "targets", label: "TGT" },
    { key: "receptions", label: "REC" },
    { key: "receiving_yards", label: "REC YD" },
    { key: "receiving_tds", label: "REC TD" },
  ];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
