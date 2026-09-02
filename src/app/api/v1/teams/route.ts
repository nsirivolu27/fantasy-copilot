import { authenticate } from "@/lib/api/auth";
import { fail, ok, unauthorized } from "@/lib/api/respond";
import { prisma } from "@/lib/db";
import { getActiveLeague } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/teams
 * GET /api/v1/teams?include=roster — adds each team's players and projections.
 */
export async function GET(request: Request) {
  const auth = await authenticate(request, "read:league");
  if (!auth.ok) return unauthorized(auth);

  const league = await getActiveLeague();
  if (!league) return fail("No league is synced yet.", 404);

  const includeRoster = new URL(request.url).searchParams.get("include") === "roster";

  const teams = await prisma.team.findMany({
    where: { leagueId: league.id },
    orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
    include: includeRoster ? { rosterSpots: { include: { player: true } } } : undefined,
  });

  const projections = includeRoster
    ? await prisma.projection.findMany({
        where: { leagueId: league.id, season: league.season, week: league.currentWeek },
      })
    : [];
  const byPlayer = new Map(projections.map((p) => [p.playerId, p]));

  return ok(
    teams.map((t) => ({
      id: t.id,
      platformTeamId: t.platformTeamId,
      name: t.name,
      manager: t.ownerName,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      pointsFor: t.pointsFor,
      pointsAgainst: t.pointsAgainst,
      faabRemaining:
        league.waiverBudget != null && t.waiverBudgetUsed != null
          ? league.waiverBudget - t.waiverBudgetUsed
          : null,
      isMine: t.isMine,
      ...(includeRoster && "rosterSpots" in t
        ? {
            roster: t.rosterSpots.map((s) => ({
              playerId: s.playerId,
              name: s.player.fullName,
              position: s.player.position,
              nflTeam: s.player.nflTeam,
              injuryStatus: s.player.injuryStatus,
              slot: s.slot,
              isStarter: s.isStarter,
              projectedPoints: byPlayer.get(s.playerId)?.projectedPoints ?? null,
              confidence: byPlayer.get(s.playerId)?.confidence ?? null,
            })),
          }
        : {}),
    })),
    { week: league.currentWeek, season: league.season },
  );
}
