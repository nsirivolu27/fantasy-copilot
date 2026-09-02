import Link from "next/link";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { getActiveLeague } from "@/lib/settings";
import { getSportModule } from "@/lib/sports";
import { PLACEHOLDER_LEAGUE } from "@/lib/defaults";
import type { NormalizedSlot } from "@/lib/platforms/types";
import { Badge, Banner, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { TeamCard, type RosterRow } from "@/components/TeamCard";

export const dynamic = "force-dynamic";

export default async function LeaguePage() {
  const league = await getActiveLeague();

  if (!league) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="No league synced yet"
          body="Add your Sleeper league ID in Settings and run a sync. Everything on this page comes straight from Sleeper — nothing is guessed."
          action={
            <Link
              href="/settings"
              className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
            >
              Go to Settings
            </Link>
          }
        />
        <Card>
          <CardHeader
            title="Placeholder preview"
            subtitle="Not real data — replaced entirely by your league on first sync."
            right={<Badge className="bg-amber-500/15 text-amber-300 ring-amber-500/30">Default</Badge>}
          />
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
            <Stat label="League" value={PLACEHOLDER_LEAGUE.name} hint="placeholder" />
            <Stat label="Teams" value={PLACEHOLDER_LEAGUE.teamCount} hint="placeholder" />
            <Stat label="Format" value={PLACEHOLDER_LEAGUE.format} hint="placeholder" />
          </div>
        </Card>
      </div>
    );
  }

  const sport = getSportModule(league.sport);
  const scoring = parseJson<Record<string, number>>(league.scoringSettingsJson, {});
  const slots = parseJson<NormalizedSlot[]>(league.rosterSlotsJson, []);

  const teams = await prisma.team.findMany({
    where: { leagueId: league.id },
    orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
    include: {
      rosterSpots: {
        include: { player: true },
        orderBy: [{ isStarter: "desc" }, { slotIndex: "asc" }],
      },
    },
  });

  // Projections for the current week, keyed by player.
  const projectionRows = await prisma.projection.findMany({
    where: { leagueId: league.id, week: league.currentWeek, season: league.season },
  });
  const projectionByPlayer = new Map(projectionRows.map((p) => [p.playerId, p]));

  const starterSlots = slots.filter((s) => s.isStarter);
  const benchSlots = slots.filter((s) => !s.isStarter);
  const scoringKeys = Object.keys(scoring).sort();

  const toRow = (spot: (typeof teams)[number]["rosterSpots"][number]): RosterRow => ({
    id: spot.id,
    slot: spot.slot,
    slotLabel: sport.slotLabel(spot.slot),
    isStarter: spot.isStarter,
    playerName: spot.player.fullName,
    position: spot.player.position,
    nflTeam: spot.player.nflTeam,
    injuryStatus: spot.player.injuryStatus,
    positionColor: sport.positionColor(spot.player.position),
    projectedPoints: projectionByPlayer.get(spot.player.id)?.projectedPoints ?? null,
    floor: projectionByPlayer.get(spot.player.id)?.floor ?? null,
    ceiling: projectionByPlayer.get(spot.player.id)?.ceiling ?? null,
    confidence: projectionByPlayer.get(spot.player.id)?.confidence ?? null,
  });

  return (
    <div className="space-y-5">
      {league.syncStatus === "stale" ? (
        <Banner tone="warn" title="Showing cached data — the last sync failed">
          {league.lastSyncError}
          {league.lastSyncedAt ? (
            <> Last good sync: {league.lastSyncedAt.toLocaleString()}.</>
          ) : null}
        </Banner>
      ) : null}

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{league.name}</h1>
          <Badge className="bg-white/5 text-[var(--muted)] ring-white/10">{league.platform}</Badge>
          {league.isDynasty ? (
            <Badge className="bg-violet-500/15 text-violet-300 ring-violet-500/30">Dynasty</Badge>
          ) : null}
          {league.isKeeper ? (
            <Badge className="bg-violet-500/15 text-violet-300 ring-violet-500/30">Keeper</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {league.lastSyncedAt
            ? `Synced ${league.lastSyncedAt.toLocaleString()}`
            : "Never synced"}{" "}
          · league ID <span className="font-mono">{league.platformLeagueId}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Season" value={league.season} hint={league.seasonState ?? undefined} />
        <Stat label="Current week" value={league.currentWeek || "—"} hint="from Sleeper" />
        <Stat label="Teams" value={league.teamCount} />
        <Stat
          label="Waivers"
          value={league.waiverType === "faab" ? "FAAB" : league.waiverType === "rolling" ? "Priority" : "—"}
          hint={league.waiverBudget ? `$${league.waiverBudget} budget` : undefined}
        />
      </div>

      <Card>
        <CardHeader
          title="Roster slots"
          subtitle={`${starterSlots.length} starters · ${benchSlots.length} bench/IR`}
        />
        <div className="p-3">
          {slots.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">Sleeper returned no roster positions.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s) => (
                <Badge
                  key={`${s.code}-${s.index}`}
                  className={
                    s.isStarter
                      ? sport.positionColor(s.code)
                      : "bg-white/5 text-[var(--muted)] ring-white/10"
                  }
                >
                  {sport.slotLabel(s.code)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Scoring settings"
          subtitle={`${scoringKeys.length} rules, read from your league`}
        />
        <div className="p-3">
          {scoringKeys.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">Sleeper returned no scoring settings.</p>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {scoringKeys.map((key) => (
                <div
                  key={key}
                  className="flex items-baseline justify-between gap-3 border-b border-[var(--border)]/60 py-1.5"
                >
                  <dt className="min-w-0 truncate text-[13px] text-[var(--muted)]" title={key}>
                    {sport.scoringLabel(key)}
                  </dt>
                  <dd className="shrink-0 font-mono text-[13px] tabular-nums">{scoring[key]}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </Card>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Teams ({teams.length})</h2>
          {projectionRows.length ? (
            <p className="text-[11px] text-[var(--muted)]">
              Week {league.currentWeek} projections · {projectionRows[0].modelVersion}
            </p>
          ) : (
            <Link href="/settings" className="text-[11px] text-[var(--muted)] underline">
              Add projections
            </Link>
          )}
        </div>
        {teams.length === 0 ? (
          <EmptyState
            title="No teams stored"
            body="The league synced but returned no rosters. Try syncing again from Settings."
          />
        ) : (
          <div className="space-y-2">
            {teams.map((t) => (
              <TeamCard
                key={t.id}
                name={t.name}
                ownerName={t.ownerName}
                record={`${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`}
                pointsFor={t.pointsFor}
                pointsAgainst={t.pointsAgainst}
                isMine={t.isMine}
                starters={t.rosterSpots.filter((s) => s.isStarter).map(toRow)}
                bench={t.rosterSpots.filter((s) => !s.isStarter).map(toRow)}
                projectedTotal={
                  projectionRows.length
                    ? t.rosterSpots
                        .filter((s) => s.isStarter)
                        .reduce(
                          (sum, s) => sum + (projectionByPlayer.get(s.player.id)?.projectedPoints ?? 0),
                          0,
                        )
                    : null
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
