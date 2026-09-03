import { prisma } from "@/lib/db";
import { stringifyJson } from "@/lib/json";
import { getAdapter, PlatformError, type PlatformId } from "@/lib/platforms";
import { refreshPlayerCache, upsertPlayers } from "@/lib/platforms/sleeper/playerCache";
import { SleeperAdapter } from "@/lib/platforms/sleeper/adapter";

export interface SyncResult {
  ok: boolean;
  leagueId?: string;
  teamCount?: number;
  rosterSpotCount?: number;
  playersRefreshed?: number | null;
  playerNamesAvailable: boolean;
  warnings: string[];
  error?: string;
  errorCode?: string;
}

/**
 * Pulls a league from its platform and writes normalized rows.
 *
 * Failure policy: if the upstream fetch fails we do NOT touch existing rows.
 * We only stamp syncStatus/lastSyncError on the league (when we already have
 * one) so the UI can show the last good data with a clear stale banner.
 */
export async function syncLeague(platform: PlatformId, platformLeagueId: string): Promise<SyncResult> {
  const warnings: string[] = [];
  const trimmedId = platformLeagueId.trim();

  if (!/^\d{5,25}$/.test(trimmedId)) {
    return {
      ok: false,
      playerNamesAvailable: false,
      warnings,
      error:
        "That doesn't look like a Sleeper league ID. It's the long number in your league URL: sleeper.com/leagues/<ID>/team",
      errorCode: "invalid_id",
    };
  }

  const adapter = getAdapter(platform);

  // --- 1. Fetch everything before writing anything ------------------------
  let league, teams, rosters;
  try {
    league = await adapter.getLeague(trimmedId);
    [teams, rosters] = await Promise.all([
      adapter.getTeams(trimmedId),
      adapter.getRosters(trimmedId),
    ]);
  } catch (err) {
    const platformErr = err instanceof PlatformError ? err : null;
    const message = platformErr?.message ?? (err instanceof Error ? err.message : "Unknown sync error");
    // Log without secrets — there are none on the Sleeper path, but keep the habit.
    console.error(`[sync] ${platform}/${trimmedId} failed:`, message);

    await markLeagueStale(platform, trimmedId, message);
    return {
      ok: false,
      playerNamesAvailable: false,
      warnings,
      error: message,
      errorCode: platformErr?.code ?? "unknown",
    };
  }

  // --- 2. Player metadata (best effort — must never fail the sync) --------
  let playersRefreshed: number | null = null;
  let playerNamesAvailable = true;
  try {
    playersRefreshed = await refreshPlayerCache();
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.warn("[sync] player dictionary unavailable:", message);
    warnings.push("Player names are unavailable right now — showing player IDs instead.");
    playerNamesAvailable = false;
  }

  // Make sure every rostered player exists as a row, even if the dictionary
  // was unavailable. Placeholder rows get real names on the next good sync.
  const rosteredIds = [...new Set(rosters.flatMap((r) => r.spots.map((s) => s.platformPlayerId)))];
  const known = await prisma.player.findMany({
    where: { sleeperId: { in: rosteredIds } },
    select: { sleeperId: true },
  });
  const knownIds = new Set(known.map((p) => p.sleeperId));
  const missing = rosteredIds.filter((id) => !knownIds.has(id));
  if (missing.length > 0) {
    if (playerNamesAvailable) {
      warnings.push(`${missing.length} rostered player(s) had no dictionary entry and show as IDs.`);
    }
    await upsertPlayers(
      missing.map((id) => ({ platformPlayerId: id, fullName: `Player ${id}` })),
    );
  }

  // --- 3. Write the league --------------------------------------------------
  const saved = await prisma.league.upsert({
    where: {
      platform_platformLeagueId_season: {
        platform,
        platformLeagueId: league.platformLeagueId,
        season: league.season,
      },
    },
    create: {
      platform,
      platformLeagueId: league.platformLeagueId,
      sport: league.sport,
      season: league.season,
      name: league.name,
      teamCount: league.teamCount || teams.length,
      currentWeek: league.currentWeek,
      seasonState: league.seasonState,
      scoringSettingsJson: stringifyJson(league.scoringSettings),
      rosterSlotsJson: stringifyJson(league.rosterSlots),
      waiverType: league.waiverType,
      waiverBudget: league.waiverBudget,
      isDynasty: league.isDynasty,
      isKeeper: league.isKeeper,
      syncStatus: "ok",
      lastSyncedAt: new Date(),
      lastSyncError: null,
    },
    update: {
      name: league.name,
      sport: league.sport,
      teamCount: league.teamCount || teams.length,
      currentWeek: league.currentWeek,
      seasonState: league.seasonState,
      scoringSettingsJson: stringifyJson(league.scoringSettings),
      rosterSlotsJson: stringifyJson(league.rosterSlots),
      waiverType: league.waiverType,
      waiverBudget: league.waiverBudget,
      isDynasty: league.isDynasty,
      isKeeper: league.isKeeper,
      syncStatus: "ok",
      lastSyncedAt: new Date(),
      lastSyncError: null,
    },
  });

  // --- 4. Write teams -------------------------------------------------------
  for (const t of teams) {
    await prisma.team.upsert({
      where: { leagueId_platformTeamId: { leagueId: saved.id, platformTeamId: t.platformTeamId } },
      create: {
        leagueId: saved.id,
        platformTeamId: t.platformTeamId,
        name: t.name,
        ownerName: t.ownerName,
        avatar: t.avatar,
        wins: t.wins,
        losses: t.losses,
        ties: t.ties,
        pointsFor: t.pointsFor,
        pointsAgainst: t.pointsAgainst,
        waiverBudgetUsed: t.waiverBudgetUsed,
      },
      update: {
        // isMine is deliberately NOT updated — it's the user's choice, not the platform's.
        name: t.name,
        ownerName: t.ownerName,
        avatar: t.avatar,
        wins: t.wins,
        losses: t.losses,
        ties: t.ties,
        pointsFor: t.pointsFor,
        pointsAgainst: t.pointsAgainst,
        waiverBudgetUsed: t.waiverBudgetUsed,
      },
    });
  }

  // --- 5. Write rosters (replace per team; rosters change constantly) -------
  const teamRows = await prisma.team.findMany({ where: { leagueId: saved.id } });
  const teamIdByPlatformId = new Map(teamRows.map((t) => [t.platformTeamId, t.id]));

  const playerRows = await prisma.player.findMany({
    where: { sleeperId: { in: rosteredIds } },
    select: { id: true, sleeperId: true },
  });
  const playerIdBySleeperId = new Map(playerRows.map((p) => [p.sleeperId as string, p.id]));

  let rosterSpotCount = 0;
  for (const roster of rosters) {
    const teamId = teamIdByPlatformId.get(roster.platformTeamId);
    if (!teamId) {
      warnings.push(`Roster ${roster.platformTeamId} had no matching team and was skipped.`);
      continue;
    }

    const spots = roster.spots
      .map((s) => {
        const playerId = playerIdBySleeperId.get(s.platformPlayerId);
        if (!playerId) return null;
        return {
          teamId,
          playerId,
          slot: s.slot,
          slotIndex: s.slotIndex ?? null,
          isStarter: s.isStarter,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    await prisma.$transaction([
      prisma.rosterSpot.deleteMany({ where: { teamId } }),
      ...spots.map((s) => prisma.rosterSpot.create({ data: s })),
    ]);
    rosterSpotCount += spots.length;
  }

  // Matchups are cheap and the league hub needs them; a failure here must not
  // undo the roster sync we just completed.
  try {
    const { syncMatchups } = await import("@/lib/league/service");
    await syncMatchups(saved.id, league.currentWeek);
  } catch (err) {
    warnings.push("Matchups could not be synced; the league hub will be missing this week.");
    console.warn("[sync] matchups:", err instanceof Error ? err.message : err);
  }

  return {
    ok: true,
    leagueId: saved.id,
    teamCount: teams.length,
    rosterSpotCount,
    playersRefreshed,
    playerNamesAvailable,
    warnings,
  };
}

/** Marks an existing league stale without destroying its cached rows. */
async function markLeagueStale(platform: PlatformId, platformLeagueId: string, message: string) {
  await prisma.league.updateMany({
    where: { platform, platformLeagueId },
    data: { syncStatus: "stale", lastSyncError: message },
  });
}

/** Convenience for later scheduled syncs: refresh every league we know about. */
export async function syncAllLeagues(): Promise<SyncResult[]> {
  const leagues = await prisma.league.findMany();
  const results: SyncResult[] = [];
  for (const l of leagues) {
    results.push(await syncLeague(l.platform as PlatformId, l.platformLeagueId));
  }
  return results;
}

/** Exposed for a Phase-1 debug view; the adapter owns the actual call. */
export async function getNflState() {
  return new SleeperAdapter().getNflState();
}
