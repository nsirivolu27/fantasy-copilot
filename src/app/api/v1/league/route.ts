import { authenticate } from "@/lib/api/auth";
import { fail, ok, unauthorized } from "@/lib/api/respond";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { getActiveLeague } from "@/lib/settings";
import type { NormalizedSlot } from "@/lib/platforms/types";

export const dynamic = "force-dynamic";

/** GET /api/v1/league — league settings, scoring and roster slots. */
export async function GET(request: Request) {
  const auth = await authenticate(request, "read:league");
  if (!auth.ok) return unauthorized(auth);

  const league = await getActiveLeague();
  if (!league) return fail("No league is synced yet.", 404, "Sync a league in Settings first.");

  const teams = await prisma.team.count({ where: { leagueId: league.id } });

  return ok({
    id: league.id,
    name: league.name,
    platform: league.platform,
    platformLeagueId: league.platformLeagueId,
    sport: league.sport,
    season: league.season,
    currentWeek: league.currentWeek,
    teamCount: league.teamCount,
    teamsSynced: teams,
    isDynasty: league.isDynasty,
    isKeeper: league.isKeeper,
    waiverType: league.waiverType,
    waiverBudget: league.waiverBudget,
    scoringSettings: parseJson<Record<string, number>>(league.scoringSettingsJson, {}),
    rosterSlots: parseJson<NormalizedSlot[]>(league.rosterSlotsJson, []),
    syncStatus: league.syncStatus,
    lastSyncedAt: league.lastSyncedAt,
  });
}
