import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { getLeagueFormat } from "@/lib/league/format";
import {
  evaluateTrade,
  optimizeLineup,
  pointsAboveReplacementProvider,
  createCsvValueProvider,
  createHttpValueProvider,
  type LineupPlayer,
  type LineupSlot,
  type TradeEvaluation,
  type TradeValueProvider,
} from "@/lib/core";

/**
 * Bridges the database to the pure trade engine in src/lib/core.
 *
 * Everything decision-making lives in core and is unit tested; this file only
 * loads rows and hands them over. Keeping that split is what lets the trading
 * app share the engine without dragging Prisma along.
 */

export interface LeagueTradeContext {
  leagueId: string;
  slots: LineupSlot[];
  weeksRemaining: number;
  isDynasty: boolean;
  season: string;
  week: number;
  /** Derived from this league's format, not a constant. */
  replacementLevel: Record<string, number>;
}

export async function loadTradeContext(leagueId: string): Promise<LeagueTradeContext> {
  const format = await getLeagueFormat(leagueId);
  return {
    leagueId,
    slots: format.slots,
    weeksRemaining: format.weeksRemaining,
    isDynasty: format.isDynasty,
    season: format.season,
    week: format.week,
    replacementLevel: format.replacementLevel,
  };
}

/** A team's roster shaped for the engine, using this week's projections. */
export async function loadRoster(
  teamId: string,
  ctx: LeagueTradeContext,
): Promise<{ teamId: string; teamName: string; roster: LineupPlayer[] }> {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new Error(`Team ${teamId} not found.`);

  const spots = await prisma.rosterSpot.findMany({
    where: { teamId },
    include: { player: true },
  });
  const projections = await prisma.projection.findMany({
    where: {
      leagueId: ctx.leagueId,
      season: ctx.season,
      week: ctx.week,
      playerId: { in: spots.map((s) => s.playerId) },
    },
  });
  const byPlayer = new Map(projections.map((p) => [p.playerId, p]));

  return {
    teamId: team.id,
    teamName: team.name,
    roster: spots.map((s) => ({
      playerId: s.playerId,
      name: s.player.fullName,
      position: s.player.position ?? "FLEX",
      projectedPoints: byPlayer.get(s.playerId)?.projectedPoints ?? 0,
    })),
  };
}

/** The configured value provider, or the built-in one. */
export async function getValueProvider(): Promise<TradeValueProvider> {
  const config =
    (await prisma.valueProviderConfig.findFirst({ where: { isDefault: true } })) ??
    (await prisma.valueProviderConfig.findFirst());
  if (!config) return pointsAboveReplacementProvider;

  if (config.kind === "http" && config.endpoint) {
    return createHttpValueProvider({
      id: config.id,
      label: config.label,
      endpoint: config.endpoint,
      apiKey: config.apiKey ?? undefined,
    });
  }
  if (config.kind === "csv" && config.rowsJson) {
    return createCsvValueProvider({
      id: config.id,
      label: config.label,
      rows: parseJson<{ name: string; value: number }[]>(config.rowsJson, []),
    });
  }
  return pointsAboveReplacementProvider;
}

export interface EvaluateRequest {
  leagueId: string;
  fromTeamId: string;
  toTeamId: string;
  /** Player ids the "from" team sends. */
  fromPlayerIds: string[];
  /** Player ids the "to" team sends back. */
  toPlayerIds: string[];
}

export async function evaluate(request: EvaluateRequest): Promise<TradeEvaluation> {
  const ctx = await loadTradeContext(request.leagueId);
  const [from, to] = await Promise.all([
    loadRoster(request.fromTeamId, ctx),
    loadRoster(request.toTeamId, ctx),
  ]);

  const provider = await getValueProvider();
  const all = [...from.roster, ...to.roster];
  const values = await provider
    .getValues(
      all.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        projectedPointsPerGame: p.projectedPoints,
      })),
      {
        weeksRemaining: ctx.weeksRemaining,
        isDynasty: ctx.isDynasty,
        replacementLevel: ctx.replacementLevel,
      },
    )
    .catch(() => []); // an external provider failing must not break evaluation

  return evaluateTrade({
    sideA: { ...from, sending: request.fromPlayerIds },
    sideB: { ...to, sending: request.toPlayerIds },
    slots: ctx.slots,
    values,
    weeksRemaining: ctx.weeksRemaining,
  });
}

/** Best legal lineup for one team, also the basis of Phase 3's optimizer. */
export async function bestLineup(leagueId: string, teamId: string) {
  const ctx = await loadTradeContext(leagueId);
  const { roster, teamName } = await loadRoster(teamId, ctx);
  return { teamName, ...optimizeLineup(roster, ctx.slots) };
}

/**
 * Scans every other roster for one-for-one swaps that help both sides.
 *
 * One-for-one only, on purpose: the combinatorics of larger packages explode,
 * and a two-sided winner at 1-for-1 is the deal that actually gets accepted in
 * a 12-team league.
 */
export async function findTrades(
  leagueId: string,
  teamId: string,
  limit = 5,
): Promise<{ evaluation: TradeEvaluation; partnerTeamId: string }[]> {
  const ctx = await loadTradeContext(leagueId);
  const mine = await loadRoster(teamId, ctx);
  const others = await prisma.team.findMany({
    where: { leagueId, id: { not: teamId } },
    select: { id: true },
  });

  const provider = await getValueProvider();
  const results: { evaluation: TradeEvaluation; partnerTeamId: string }[] = [];

  for (const other of others) {
    const theirs = await loadRoster(other.id, ctx);
    const values = await provider
      .getValues(
        [...mine.roster, ...theirs.roster].map((p) => ({
          playerId: p.playerId,
          name: p.name,
          position: p.position,
          projectedPointsPerGame: p.projectedPoints,
        })),
        {
          weeksRemaining: ctx.weeksRemaining,
          isDynasty: ctx.isDynasty,
          replacementLevel: ctx.replacementLevel,
        },
      )
      .catch(() => []);

    for (const give of mine.roster) {
      for (const get of theirs.roster) {
        const evaluation = evaluateTrade({
          sideA: { ...mine, sending: [give.playerId] },
          sideB: { ...theirs, sending: [get.playerId] },
          slots: ctx.slots,
          values,
          weeksRemaining: ctx.weeksRemaining,
        });
        if (evaluation.mutuallyBeneficial) {
          results.push({ evaluation, partnerTeamId: other.id });
        }
      }
    }
  }

  // Rank by the smaller of the two gains, so the fairest deals surface first
  // rather than the ones that merely look best from one side.
  return results
    .sort(
      (a, b) =>
        Math.min(b.evaluation.sideA.weeklyDelta, b.evaluation.sideB.weeklyDelta) -
        Math.min(a.evaluation.sideA.weeklyDelta, a.evaluation.sideB.weeklyDelta),
    )
    .slice(0, limit);
}
