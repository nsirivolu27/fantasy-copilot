import { prisma } from "@/lib/db";
import { fetchSchedule, fetchWeeklyStats } from "./nflverse";
import { deriveByeWeeks } from "@/lib/core/schedule";

/**
 * Pulls a season of nflverse weekly stats and stores them against players we
 * already know about.
 *
 * Players are joined on GSIS id, which Sleeper's dictionary supplies, no fuzzy
 * name matching, so "D.J. Moore" and "DJ Moore" can't silently become two
 * players. Rows whose GSIS id we don't recognize are counted and reported so
 * gaps are visible rather than invisible.
 */
export interface IngestResult {
  season: string;
  rowsFetched: number;
  rowsStored: number;
  unmatchedPlayers: number;
  weeks: number[];
}

export async function ingestSeasonStats(season: string): Promise<IngestResult> {
  const rows = await fetchWeeklyStats(season);

  const gsisIds = [...new Set(rows.map((r) => r.gsisId))];
  const known = await prisma.player.findMany({
    where: { gsisId: { in: gsisIds } },
    select: { id: true, gsisId: true },
  });
  const playerIdByGsis = new Map(known.map((p) => [p.gsisId as string, p.id]));

  let rowsStored = 0;
  const unmatched = new Set<string>();
  const weeks = new Set<number>();

  const CHUNK = 100;
  const writable = rows.filter((r) => {
    const id = playerIdByGsis.get(r.gsisId);
    if (!id) {
      unmatched.add(r.gsisId);
      return false;
    }
    return true;
  });

  for (let i = 0; i < writable.length; i += CHUNK) {
    const chunk = writable.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((r) => {
        const playerId = playerIdByGsis.get(r.gsisId) as string;
        weeks.add(r.week);
        const data = {
          opponentTeam: r.opponentTeam,
          statLineJson: JSON.stringify(r.raw),
          targets: r.targets,
          targetShare: r.targetShare,
          airYardsShare: r.airYardsShare,
          wopr: r.wopr,
          carries: r.carries,
          receptions: r.receptions,
          fantasyPointsPpr: r.fantasyPointsPpr,
        };
        return prisma.weeklyStat.upsert({
          where: { playerId_season_week: { playerId, season: r.season, week: r.week } },
          create: { playerId, season: r.season, week: r.week, ...data },
          update: data,
        });
      }),
    );
    rowsStored += chunk.length;
  }

  return {
    season,
    rowsFetched: rows.length,
    rowsStored,
    unmatchedPlayers: unmatched.size,
    weeks: [...weeks].sort((a, b) => a - b),
  };
}

/**
 * Derives bye weeks from the schedule and stores them on players.
 * Best effort: a failure here must never break a stats ingest.
 */
export async function ingestByeWeeks(season: string): Promise<{
  gamesStored: number;
  teamsResolved: number;
  playersUpdated: number;
  anomalies: string[];
}> {
  const games = await fetchSchedule();
  const { byeByTeam, anomalies } = deriveByeWeeks(games, season);

  // Persist this season's schedule so the streaming planner can look ahead.
  const seasonGames = games.filter((g) => g.season === season && g.gameType === "REG");
  const CHUNK = 100;
  for (let i = 0; i < seasonGames.length; i += CHUNK) {
    await prisma.$transaction(
      seasonGames.slice(i, i + CHUNK).map((g) =>
        prisma.game.upsert({
          where: {
            season_week_homeTeam_awayTeam: {
              season: g.season,
              week: g.week,
              homeTeam: g.homeTeam,
              awayTeam: g.awayTeam,
            },
          },
          create: { season: g.season, week: g.week, gameType: g.gameType, homeTeam: g.homeTeam, awayTeam: g.awayTeam },
          update: {},
        }),
      ),
    );
  }

  let playersUpdated = 0;
  for (const [team, week] of Object.entries(byeByTeam)) {
    const result = await prisma.player.updateMany({
      where: { nflTeam: team },
      data: { byeWeek: week },
    });
    playersUpdated += result.count;
  }

  return {
    gamesStored: seasonGames.length,
    teamsResolved: Object.keys(byeByTeam).length,
    playersUpdated,
    anomalies: anomalies.map((a) => `${a.team}: off in weeks ${a.weeks.join(", ")}`),
  };
}
