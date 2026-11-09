import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import {
  deriveReplacementLevels,
  describeLeagueFormat,
  streamablePositions,
  positionStartCounts,
  DEFAULT_REPLACEMENT_LEVEL,
  type LineupSlot,
} from "@/lib/core";
import type { NormalizedSlot } from "@/lib/platforms/types";

/**
 * One place that answers "what kind of league is this", so no service has to
 * assume 12 teams, PPR, one quarterback or an 18-week season.
 *
 * Every number here comes from the league's own settings or from the player
 * pool it actually rosters.
 */
export interface LeagueFormat {
  leagueId: string;
  season: string;
  week: number;
  teamCount: number;
  slots: LineupSlot[];
  scoringSettings: Record<string, number>;
  /** Regular-season weeks left, including this one. */
  weeksRemaining: number;
  /** First week of the playoffs, from the platform. */
  playoffWeekStart: number;
  playoffSpots: number;
  isDynasty: boolean;
  isKeeper: boolean;
  waiverType: string | null;
  waiverBudget: number | null;
  /** Points a freely available player at each position is worth. */
  replacementLevel: Record<string, number>;
  /** Positions worth streaming in THIS league. */
  streamable: string[];
  /** Starting slots per position, flex shared out. */
  startCounts: Record<string, number>;
  /** One line, e.g. "12-team · PPR · 1QB · 1 flex". */
  description: string;
}

/** Fallback when a league is so fresh that nobody has a projection yet. */
const LAST_RESORT_WEEK = 18;

export async function getLeagueFormat(leagueId: string): Promise<LeagueFormat> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("League not found.");

  const allSlots = parseJson<NormalizedSlot[]>(league.rosterSlotsJson, []);
  const slots: LineupSlot[] = allSlots
    .filter((s) => s.isStarter)
    .map((s) => ({ code: s.code, index: s.index }));

  const scoringSettings = parseJson<Record<string, number>>(league.scoringSettingsJson, {});
  const week = league.currentWeek || 1;

  // Playoffs start when the league says they do. Weeks remaining is the
  // regular season only, since a lineup gain after that is worth nothing to
  // most teams.
  const playoffWeekStart = league.playoffWeekStart ?? LAST_RESORT_WEEK;
  const weeksRemaining = Math.max(1, playoffWeekStart - week);

  const teamCount =
    (await prisma.team.count({ where: { leagueId } })) || league.teamCount || 12;

  // Replacement level from the projections this league actually has. The
  // rostered pool is a good proxy for the startable universe, and it means a
  // 10-team superflex league gets different numbers than a 14-team 1QB one
  // without anyone configuring anything.
  const projections = await prisma.projection.findMany({
    where: { leagueId, season: league.season, week },
    include: { player: { select: { position: true } } },
  });
  const pool = projections
    .filter((p) => p.player.position)
    .map((p) => ({ position: p.player.position as string, projectedPoints: p.projectedPoints }));

  const replacementLevel = deriveReplacementLevels(
    pool,
    slots,
    teamCount,
    DEFAULT_REPLACEMENT_LEVEL,
  );

  const { effective } = positionStartCounts(slots);

  return {
    leagueId,
    season: league.season,
    week,
    teamCount,
    slots,
    scoringSettings,
    weeksRemaining,
    playoffWeekStart,
    playoffSpots: league.playoffTeams ?? Math.max(2, Math.floor(teamCount / 2)),
    isDynasty: league.isDynasty,
    isKeeper: league.isKeeper,
    waiverType: league.waiverType,
    waiverBudget: league.waiverBudget,
    replacementLevel,
    streamable: streamablePositions(slots),
    startCounts: effective,
    description: describeLeagueFormat({
      teamCount,
      slots,
      scoringSettings,
      isDynasty: league.isDynasty,
      isKeeper: league.isKeeper,
    }),
  };
}
