import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { project, MODEL_VERSION } from "./model";
import { scoreStatLine, type StatLine } from "./scoring";
import { getLeagueFormat } from "@/lib/league/format";

/**
 * Generates projections for every rostered player in a league, for one week.
 *
 * Each historical game is scored with THIS league's settings before the model
 * sees it, which is what makes the same model correct in PPR, half-PPR,
 * superflex or TE-premium without a code change.
 */
export interface RunResult {
  week: number;
  season: string;
  playersProjected: number;
  skippedNoStats: number;
  unsupportedScoringKeys: string[];
  modelVersion: string;
}

/**
 * Seed values only. The first run of a season has no projections to derive
 * replacement level from, so it starts here and every later run uses the
 * league's own pool via getLeagueFormat.
 */
const SEED_REPLACEMENT: Record<string, number> = { QB: 12, RB: 6, WR: 6, TE: 4, K: 7, DEF: 6 };

export async function runProjections(leagueId: string, week?: number): Promise<RunResult> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("League not found.");

  const targetWeek = week ?? league.currentWeek ?? 1;
  const scoring = parseJson<Record<string, number>>(league.scoringSettingsJson, {});

  const spots = await prisma.rosterSpot.findMany({
    where: { team: { leagueId } },
    include: { player: true },
  });
  const players = [...new Map(spots.map((s) => [s.player.id, s.player])).values()];

  // Derived from last run's projections where they exist; seeded otherwise.
  let replacementLevel: Record<string, number> = SEED_REPLACEMENT;
  try {
    const format = await getLeagueFormat(leagueId);
    replacementLevel = { ...SEED_REPLACEMENT, ...format.replacementLevel };
  } catch {
    // First run of a season: the seed values stand.
  }

  const unsupported = new Set<string>();
  let playersProjected = 0;
  let skippedNoStats = 0;

  for (const player of players) {
    const stats = await prisma.weeklyStat.findMany({
      where: { playerId: player.id, season: league.season, week: { lt: targetWeek } },
      orderBy: { week: "desc" },
    });

    // Score every prior game in this league's format.
    const scoredGames = stats.map((s) => {
      const line = parseJson<StatLine>(s.statLineJson, {});
      const numeric: StatLine = {};
      for (const [k, v] of Object.entries(line)) {
        const n = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(n)) numeric[k] = n;
      }
      const result = scoreStatLine(numeric, scoring, player.position ?? undefined);
      for (const key of result.unsupportedKeys) unsupported.add(key);
      const opportunity =
        player.position === "QB"
          ? (numeric.attempts ?? 0) + (numeric.carries ?? 0)
          : (s.targets ?? 0) + (s.carries ?? 0);
      return { week: s.week, points: result.points, opportunity };
    });

    if (scoredGames.length === 0) skippedNoStats++;

    const totalPoints = scoredGames.reduce((a, g) => a + g.points, 0);
    const totalOpportunity = scoredGames.reduce((a, g) => a + g.opportunity, 0);

    const projection = project({
      games: scoredGames.slice(0, 4),
      position: player.position ?? undefined,
      seasonAveragePoints: scoredGames.length ? totalPoints / scoredGames.length : undefined,
      seasonAverageOpportunity: scoredGames.length ? totalOpportunity / scoredGames.length : undefined,
      seasonPointsPerOpportunity: totalOpportunity > 0 ? totalPoints / totalOpportunity : 0,
      injuryStatus: player.injuryStatus,
      isByeWeek: player.byeWeek === targetWeek,
      replacementLevel: replacementLevel[player.position ?? ""] ?? 4,
    });

    await prisma.projection.upsert({
      where: {
        playerId_leagueId_season_week: {
          playerId: player.id,
          leagueId,
          season: league.season,
          week: targetWeek,
        },
      },
      create: {
        playerId: player.id,
        leagueId,
        season: league.season,
        week: targetWeek,
        projectedPoints: projection.projectedPoints,
        floor: projection.floor,
        ceiling: projection.ceiling,
        confidence: projection.confidence,
        modelVersion: projection.modelVersion,
        reasoningJson: JSON.stringify(projection.reasoning),
      },
      update: {
        projectedPoints: projection.projectedPoints,
        floor: projection.floor,
        ceiling: projection.ceiling,
        confidence: projection.confidence,
        modelVersion: projection.modelVersion,
        reasoningJson: JSON.stringify(projection.reasoning),
      },
    });
    playersProjected++;
  }

  return {
    week: targetWeek,
    season: league.season,
    playersProjected,
    skippedNoStats,
    unsupportedScoringKeys: [...unsupported],
    modelVersion: MODEL_VERSION,
  };
}
