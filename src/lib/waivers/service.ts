import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { getAdapter, type PlatformId } from "@/lib/platforms";
import { project } from "@/lib/projections/model";
import { scoreStatLine, type StatLine } from "@/lib/projections/scoring";
import {
  rankAdditions,
  rankDrops,
  recommendFaabBid,
  pointsAllowedByDefense,
  upcomingOpponents,
  type AdditionRanking,
  type DropRanking,
  type FaabAdvice,
  type LineupPlayer,
  type LineupSlot,
} from "@/lib/core";
import type { NormalizedSlot } from "@/lib/platforms/types";

/**
 * Waivers and streaming: loads rows, projects free agents, and hands the
 * ranking to the pure functions in core.
 *
 * Free agents don't have stored projections (only rostered players do), so
 * they're projected on the fly from their nflverse history using the league's
 * own scoring — the same path rostered players take.
 */

const FINAL_REGULAR_WEEK = 18;
/** The dictionary has thousands of entries; only project plausible adds. */
const MAX_CANDIDATES = 120;

export interface WaiverTarget {
  ranking: AdditionRanking;
  faab: FaabAdvice;
  /** Sleeper's 24h add count — market hype, never part of the ranking. */
  trendingAdds: number | null;
  confidence: number;
}

export interface WaiverReport {
  teamName: string;
  week: number;
  waiverType: string | null;
  budgetRemaining: number | null;
  targets: WaiverTarget[];
  drops: DropRanking[];
  candidatesConsidered: number;
}

async function leagueContext(leagueId: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("League not found.");
  const slots: LineupSlot[] = parseJson<NormalizedSlot[]>(league.rosterSlotsJson, [])
    .filter((s) => s.isStarter)
    .map((s) => ({ code: s.code, index: s.index }));
  return {
    league,
    slots,
    scoring: parseJson<Record<string, number>>(league.scoringSettingsJson, {}),
    weeksRemaining: Math.max(1, FINAL_REGULAR_WEEK - (league.currentWeek || 1) + 1),
  };
}

/** Projects one player from stored weekly stats, in this league's scoring. */
async function projectFromHistory(
  playerId: string,
  position: string | null,
  season: string,
  week: number,
  scoring: Record<string, number>,
) {
  const stats = await prisma.weeklyStat.findMany({
    where: { playerId, season, week: { lt: week } },
    orderBy: { week: "desc" },
    take: 8,
  });
  if (stats.length === 0) return null;

  const games = stats.map((s) => {
    const raw = parseJson<StatLine>(s.statLineJson, {});
    const numeric: StatLine = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) numeric[k] = n;
    }
    return {
      week: s.week,
      points: scoreStatLine(numeric, scoring, position ?? undefined).points,
      opportunity:
        position === "QB"
          ? (numeric.attempts ?? 0) + (numeric.carries ?? 0)
          : (s.targets ?? 0) + (s.carries ?? 0),
    };
  });

  const totalPoints = games.reduce((a, g) => a + g.points, 0);
  const totalOpportunity = games.reduce((a, g) => a + g.opportunity, 0);

  return project({
    games: games.slice(0, 4),
    position: position ?? undefined,
    seasonAveragePoints: totalPoints / games.length,
    seasonAverageOpportunity: totalOpportunity / games.length,
    seasonPointsPerOpportunity: totalOpportunity > 0 ? totalPoints / totalOpportunity : 0,
  });
}

export async function getWaiverReport(leagueId: string, teamId?: string): Promise<WaiverReport | null> {
  const { league, slots, scoring, weeksRemaining } = await leagueContext(leagueId);

  const team = teamId
    ? await prisma.team.findUnique({ where: { id: teamId } })
    : await prisma.team.findFirst({ where: { leagueId, isMine: true } });
  if (!team) return null;

  // My roster, with stored projections.
  const spots = await prisma.rosterSpot.findMany({
    where: { teamId: team.id },
    include: { player: true },
  });
  const myProjections = await prisma.projection.findMany({
    where: { leagueId, season: league.season, week: league.currentWeek, playerId: { in: spots.map((s) => s.playerId) } },
  });
  const projectionByPlayer = new Map(myProjections.map((p) => [p.playerId, p]));

  const roster: LineupPlayer[] = spots.map((s) => ({
    playerId: s.playerId,
    name: s.player.fullName,
    position: s.player.position ?? "FLEX",
    projectedPoints: projectionByPlayer.get(s.playerId)?.projectedPoints ?? 0,
    injuryStatus: s.player.injuryStatus,
    isOnBye: s.player.byeWeek === league.currentWeek,
  }));

  // Free agents from the platform, narrowed before the expensive step.
  const adapter = getAdapter(league.platform as PlatformId);
  const freeAgents = await adapter.getFreeAgents(league.platformLeagueId);
  const freeAgentIds = freeAgents.map((f) => f.platformPlayerId);

  const known = await prisma.player.findMany({
    where: { sleeperId: { in: freeAgentIds } },
    select: { id: true, sleeperId: true, fullName: true, position: true, injuryStatus: true, byeWeek: true },
  });

  // Rank by recent production first so we only project a plausible shortlist.
  const recent = await prisma.weeklyStat.groupBy({
    by: ["playerId"],
    where: { playerId: { in: known.map((k) => k.id) }, season: league.season },
    _avg: { fantasyPointsPpr: true },
    orderBy: { _avg: { fantasyPointsPpr: "desc" } },
    take: MAX_CANDIDATES,
  });
  const shortlistIds = new Set(recent.map((r) => r.playerId));
  const shortlist = known.filter((k) => shortlistIds.has(k.id));

  const candidates: LineupPlayer[] = [];
  const confidenceById = new Map<string, number>();
  for (const player of shortlist) {
    const projection = await projectFromHistory(
      player.id,
      player.position,
      league.season,
      league.currentWeek,
      scoring,
    );
    if (!projection) continue;
    confidenceById.set(player.id, projection.confidence);
    candidates.push({
      playerId: player.id,
      name: player.fullName,
      position: player.position ?? "FLEX",
      projectedPoints: projection.projectedPoints,
      injuryStatus: player.injuryStatus,
      isOnBye: player.byeWeek === league.currentWeek,
    });
  }

  const ranked = rankAdditions(roster, slots, candidates).filter((r) => r.lineupGain > 0);

  // League-wide budget context, so bids account for the competition.
  const otherTeams = await prisma.team.findMany({ where: { leagueId, id: { not: team.id } } });
  const budget = league.waiverBudget;
  const budgetRemaining =
    budget != null && team.waiverBudgetUsed != null ? budget - team.waiverBudgetUsed : null;
  const othersRemaining =
    budget != null
      ? otherTeams.map((t) => budget - (t.waiverBudgetUsed ?? 0))
      : [];
  const leagueAverageRemaining = othersRemaining.length
    ? othersRemaining.reduce((a, b) => a + b, 0) / othersRemaining.length
    : null;

  const trending = await fetchTrendingAdds().catch(() => new Map<string, number>());
  const sleeperIdByPlayerId = new Map(known.map((k) => [k.id, k.sleeperId]));

  const targets: WaiverTarget[] = ranked.slice(0, 15).map((ranking) => ({
    ranking,
    faab: recommendFaabBid({
      lineupGain: ranking.lineupGain,
      budgetRemaining: league.waiverType === "faab" ? budgetRemaining : null,
      weeksRemaining,
      leagueAverageRemaining,
    }),
    trendingAdds: trending.get(sleeperIdByPlayerId.get(ranking.player.playerId) ?? "") ?? null,
    confidence: confidenceById.get(ranking.player.playerId) ?? 0,
  }));

  const protectedIds = spots.filter((s) => s.isProtected).map((s) => s.playerId);

  return {
    teamName: team.name,
    week: league.currentWeek,
    waiverType: league.waiverType,
    budgetRemaining,
    targets,
    drops: rankDrops(roster, slots, protectedIds).slice(0, 8),
    candidatesConsidered: candidates.length,
  };
}

/** Sleeper's 24h add counts. Market hype, shown beside our number, never in it. */
async function fetchTrendingAdds(): Promise<Map<string, number>> {
  const res = await fetch(
    "https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=50",
    { cache: "no-store" },
  );
  if (!res.ok) return new Map();
  const rows = (await res.json()) as { player_id?: string; count?: number }[];
  return new Map(rows.filter((r) => r.player_id).map((r) => [r.player_id as string, r.count ?? 0]));
}

// ─── Streaming ───────────────────────────────────────────────────────────────

export interface StreamOption {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  isRostered: boolean;
  projectedPoints: number;
  /** Next three weeks: opponent and how generous that defense is. */
  schedule: { week: number; opponent: string | null; multiplier: number | null }[];
  /** Average multiplier across the three weeks, for sorting. */
  scheduleScore: number;
}

export async function getStreamers(
  leagueId: string,
  positions = ["QB", "TE", "K", "DEF"],
): Promise<{ week: number; byPosition: Record<string, StreamOption[]> }> {
  const { league, scoring } = await leagueContext(leagueId);
  const week = league.currentWeek || 1;

  const schedule = await prisma.game.findMany({
    where: { season: league.season, gameType: "REG" },
    select: { season: true, week: true, homeTeam: true, awayTeam: true },
  });

  // Defensive strength from every stat row we've ingested this season.
  const stats = await prisma.weeklyStat.findMany({
    where: { season: league.season, opponentTeam: { not: null } },
    include: { player: { select: { position: true } } },
  });
  const strength = pointsAllowedByDefense(
    stats.map((s) => ({
      opponentTeam: s.opponentTeam as string,
      position: s.player.position ?? "",
      points: s.fantasyPointsPpr ?? 0,
      week: s.week,
    })) as never,
  );

  const rosteredIds = new Set(
    (await prisma.rosterSpot.findMany({ where: { team: { leagueId } }, select: { playerId: true } })).map(
      (s) => s.playerId,
    ),
  );

  const byPosition: Record<string, StreamOption[]> = {};

  for (const position of positions) {
    const players = await prisma.player.findMany({
      where: { position, nflTeam: { not: null } },
      take: 80,
    });

    const options: StreamOption[] = [];
    for (const player of players) {
      if (rosteredIds.has(player.id)) continue;
      const projection = await projectFromHistory(player.id, position, league.season, week, scoring);
      const upcoming = upcomingOpponents(schedule, player.nflTeam as string, week, 3);

      const rows = upcoming.map((u) => ({
        week: u.week,
        opponent: u.opponent,
        multiplier: u.opponent ? (strength[u.opponent]?.[position]?.multiplier ?? null) : null,
      }));
      const known = rows.map((r) => r.multiplier).filter((m): m is number => m != null);

      options.push({
        playerId: player.id,
        name: player.fullName,
        position,
        nflTeam: player.nflTeam,
        isRostered: false,
        projectedPoints: projection?.projectedPoints ?? 0,
        schedule: rows,
        scheduleScore: known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1,
      });
    }

    byPosition[position] = options
      .sort(
        (a, b) =>
          b.projectedPoints * b.scheduleScore - a.projectedPoints * a.scheduleScore ||
          b.scheduleScore - a.scheduleScore,
      )
      .slice(0, 8);
  }

  return { week, byPosition };
}
