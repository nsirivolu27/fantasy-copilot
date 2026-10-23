import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { summarizePlayerStats, type PlayerStatSummary } from "@/lib/core/playerStats";
import { scoreStatLine, type StatLine } from "@/lib/projections/scoring";

export async function getRosterStatSummaries(
  leagueId: string,
  season: string,
  scoringSettings: Record<string, number>,
): Promise<Map<string, PlayerStatSummary>> {
  const rows = await prisma.weeklyStat.findMany({
    where: { season, player: { rosterSpots: { some: { team: { leagueId } } } } },
    include: { player: { select: { position: true } } },
    orderBy: { week: "asc" },
  });

  const gamesByPlayer = new Map<string, { week: number; fantasyPoints: number; stats: Record<string, number> }[]>();
  const positionByPlayer = new Map<string, string | null>();
  for (const row of rows) {
    const raw = parseJson<StatLine>(row.statLineJson, {});
    const stats: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      const number = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(number)) stats[key] = number;
    }
    const games = gamesByPlayer.get(row.playerId) ?? [];
    games.push({
      week: row.week,
      fantasyPoints: scoreStatLine(stats, scoringSettings, row.player.position ?? undefined).points,
      stats,
    });
    gamesByPlayer.set(row.playerId, games);
    positionByPlayer.set(row.playerId, row.player.position);
  }

  const summaries = new Map<string, PlayerStatSummary>();
  for (const [playerId, games] of gamesByPlayer) {
    const summary = summarizePlayerStats(positionByPlayer.get(playerId), games);
    if (summary) summaries.set(playerId, summary);
  }
  return summaries;
}
