import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { adviseLineup, type LineupAdvice, type LineupPlayer } from "@/lib/core";
import type { NormalizedSlot } from "@/lib/platforms/types";

/**
 * Loads a team's roster and current lineup, then hands both to the pure
 * advisor in core. All the judgement lives there; this only fetches rows.
 */
export interface StartSitResult extends LineupAdvice {
  teamId: string;
  teamName: string;
  week: number;
  hasProjections: boolean;
}

export async function getStartSitAdvice(
  leagueId: string,
  teamId?: string,
): Promise<StartSitResult | null> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return null;

  const team = teamId
    ? await prisma.team.findUnique({ where: { id: teamId } })
    : await prisma.team.findFirst({ where: { leagueId, isMine: true } });
  if (!team) return null;

  const slots = parseJson<NormalizedSlot[]>(league.rosterSlotsJson, [])
    .filter((s) => s.isStarter)
    .map((s) => ({ code: s.code, index: s.index }));

  const spots = await prisma.rosterSpot.findMany({
    where: { teamId: team.id },
    include: { player: true },
    orderBy: [{ isStarter: "desc" }, { slotIndex: "asc" }],
  });

  const projections = await prisma.projection.findMany({
    where: {
      leagueId,
      season: league.season,
      week: league.currentWeek,
      playerId: { in: spots.map((s) => s.playerId) },
    },
  });
  const byPlayer = new Map(projections.map((p) => [p.playerId, p]));

  const roster: LineupPlayer[] = spots.map((s) => {
    const projection = byPlayer.get(s.playerId);
    return {
      playerId: s.playerId,
      name: s.player.fullName,
      position: s.player.position ?? "FLEX",
      projectedPoints: projection?.projectedPoints ?? 0,
      injuryStatus: s.player.injuryStatus,
      isOnBye: s.player.byeWeek != null && s.player.byeWeek === league.currentWeek,
      hasProjection: projection != null,
    };
  });

  const currentStarterIds = spots.filter((s) => s.isStarter).map((s) => s.playerId);
  const advice = adviseLineup({ roster, currentStarterIds, slots });

  return {
    ...advice,
    teamId: team.id,
    teamName: team.name,
    week: league.currentWeek,
    hasProjections: projections.length > 0,
  };
}
