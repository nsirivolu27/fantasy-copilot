import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { getAdapter, type PlatformId } from "@/lib/platforms";
import {
  powerRankings,
  simulateMatchup,
  playoffOdds,
  optimizeLineup,
  type LineupSlot,
  type PowerRanking,
  type SimPlayer,
} from "@/lib/core";
import type { NormalizedSlot } from "@/lib/platforms/types";

/**
 * The league hub: standings, this week's odds, playoff odds and the digest.
 * All the math lives in core/league.ts; this loads rows and calls it.
 */

const FINAL_REGULAR_WEEK = 18;
/** Typical league; overridden by the platform's setting when we have it. */
const DEFAULT_PLAYOFF_SPOTS = 6;

export interface MatchupView {
  matchupId: string;
  home: { teamId: string; name: string; projected: number; actual: number };
  away: { teamId: string; name: string; projected: number; actual: number };
  winProbability: number | null;
}

export interface DigestLine {
  title: string;
  detail: string;
}

export interface LeagueHub {
  week: number;
  rankings: PowerRanking[];
  matchups: MatchupView[];
  playoffOdds: Record<string, number>;
  playoffSpots: number;
  digest: DigestLine[];
  hasProjections: boolean;
}

/** Pulls this week's matchups from the platform and stores them. */
export async function syncMatchups(leagueId: string, week?: number): Promise<number> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("League not found.");
  const targetWeek = week ?? league.currentWeek ?? 1;

  const adapter = getAdapter(league.platform as PlatformId);
  const rows = await adapter.getMatchups(league.platformLeagueId, targetWeek);

  const teams = await prisma.team.findMany({ where: { leagueId } });
  const teamByPlatformId = new Map(teams.map((t) => [t.platformTeamId, t.id]));

  let stored = 0;
  for (const row of rows) {
    const teamId = teamByPlatformId.get(row.platformTeamId);
    if (!teamId) continue;
    await prisma.matchup.upsert({
      where: { leagueId_week_teamId: { leagueId, week: row.week, teamId } },
      create: { leagueId, week: row.week, teamId, platformMatchupId: row.matchupId, points: row.points },
      update: { platformMatchupId: row.matchupId, points: row.points },
    });
    stored++;
  }
  return stored;
}

export async function getLeagueHub(leagueId: string): Promise<LeagueHub | null> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return null;

  const week = league.currentWeek || 1;
  const teams = await prisma.team.findMany({ where: { leagueId } });
  if (teams.length === 0) return null;

  const rankings = powerRankings(
    teams.map((t) => ({
      teamId: t.id,
      name: t.name,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      pointsFor: t.pointsFor,
      pointsAgainst: t.pointsAgainst,
    })),
  );

  const slots: LineupSlot[] = parseJson<NormalizedSlot[]>(league.rosterSlotsJson, [])
    .filter((s) => s.isStarter)
    .map((s) => ({ code: s.code, index: s.index }));

  const projections = await prisma.projection.findMany({
    where: { leagueId, season: league.season, week },
  });
  const hasProjections = projections.length > 0;
  const projectionByPlayer = new Map(projections.map((p) => [p.playerId, p]));

  // Each team's optimal starting lineup, as the simulator's input.
  const lineupByTeam = new Map<string, SimPlayer[]>();
  const projectedTotal = new Map<string, number>();
  for (const team of teams) {
    const spots = await prisma.rosterSpot.findMany({
      where: { teamId: team.id },
      include: { player: true },
    });
    const players = spots.map((s) => {
      const p = projectionByPlayer.get(s.playerId);
      return {
        playerId: s.playerId,
        name: s.player.fullName,
        position: s.player.position ?? "FLEX",
        projectedPoints: p?.projectedPoints ?? 0,
      };
    });
    const optimal = optimizeLineup(players, slots);
    const starters: SimPlayer[] = optimal.assignments
      .map((a) => a.player)
      .filter((p): p is NonNullable<typeof p> => p != null)
      .map((p) => {
        const row = projectionByPlayer.get(p.playerId);
        return {
          projectedPoints: p.projectedPoints,
          floor: row?.floor ?? p.projectedPoints * 0.6,
          ceiling: row?.ceiling ?? p.projectedPoints * 1.4,
        };
      });
    lineupByTeam.set(team.id, starters);
    projectedTotal.set(team.id, optimal.total);
  }

  // Pair teams by stored matchup id.
  const rows = await prisma.matchup.findMany({ where: { leagueId, week } });
  const byMatchup = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byMatchup.has(row.platformMatchupId)) byMatchup.set(row.platformMatchupId, []);
    (byMatchup.get(row.platformMatchupId) as typeof rows).push(row);
  }

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const matchups: MatchupView[] = [];
  for (const [matchupId, pair] of byMatchup) {
    if (pair.length !== 2) continue; // a bye in an odd-sized league
    const [a, b] = pair;
    const side = (row: (typeof pair)[number]) => ({
      teamId: row.teamId,
      name: teamById.get(row.teamId)?.name ?? "Unknown",
      projected: projectedTotal.get(row.teamId) ?? 0,
      actual: row.points,
    });

    matchups.push({
      matchupId,
      home: side(a),
      away: side(b),
      winProbability: hasProjections
        ? simulateMatchup(lineupByTeam.get(a.teamId) ?? [], lineupByTeam.get(b.teamId) ?? [], {
            iterations: 4000,
            // Seeded per matchup so the number is stable across page loads.
            seed: hashSeed(`${leagueId}:${week}:${matchupId}`),
          }).winProbability
        : null,
    });
  }

  // Remaining schedule, approximated by round-robin pairing of who hasn't met.
  const remaining = await buildRemainingSchedule(leagueId, week, teams.map((t) => t.id));
  const playoffSpots = Math.min(DEFAULT_PLAYOFF_SPOTS, Math.max(2, Math.floor(teams.length / 2)));

  return {
    week,
    rankings,
    matchups,
    playoffOdds: playoffOdds({
      teams: rankings,
      remaining,
      playoffSpots,
      iterations: 2000,
      seed: hashSeed(`${leagueId}:playoffs:${week}`),
    }),
    playoffSpots,
    digest: buildDigest(rankings, rows, teamById, week),
    hasProjections,
  };
}

/**
 * Sleeper doesn't publish a forward schedule, so the remaining games are
 * approximated: each remaining week pairs teams round-robin. Good enough for
 * playoff odds, and honestly labelled in the UI as an approximation.
 */
async function buildRemainingSchedule(leagueId: string, fromWeek: number, teamIds: string[]) {
  const games: { week: number; homeTeamId: string; awayTeamId: string }[] = [];
  const rotation = [...teamIds];
  for (let week = fromWeek + 1; week <= FINAL_REGULAR_WEEK - 3; week++) {
    for (let i = 0; i < Math.floor(rotation.length / 2); i++) {
      games.push({
        week,
        homeTeamId: rotation[i],
        awayTeamId: rotation[rotation.length - 1 - i],
      });
    }
    rotation.splice(1, 0, rotation.pop() as string); // rotate for the next week
  }
  return games;
}

function buildDigest(
  rankings: PowerRanking[],
  rows: { teamId: string; points: number; platformMatchupId: string }[],
  teamById: Map<string, { name: string }>,
  week: number,
): DigestLine[] {
  const lines: DigestLine[] = [];
  const name = (id: string) => teamById.get(id)?.name ?? "Unknown";

  const pairs = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!pairs.has(row.platformMatchupId)) pairs.set(row.platformMatchupId, []);
    (pairs.get(row.platformMatchupId) as typeof rows).push(row);
  }
  const played = [...pairs.values()].filter((p) => p.length === 2 && p.some((r) => r.points > 0));

  if (played.length > 0) {
    const margins = played.map((p) => ({
      pair: p,
      margin: Math.abs(p[0].points - p[1].points),
    }));
    const blowout = margins.reduce((a, b) => (b.margin > a.margin ? b : a));
    const nailBiter = margins.reduce((a, b) => (b.margin < a.margin ? b : a));

    const describe = (p: (typeof played)[number]) => {
      const [hi, lo] = [...p].sort((x, y) => y.points - x.points);
      return `${name(hi.teamId)} ${hi.points.toFixed(1)} — ${lo.points.toFixed(1)} ${name(lo.teamId)}`;
    };

    lines.push({ title: "Biggest blowout", detail: describe(blowout.pair) });
    lines.push({ title: "Closest game", detail: describe(nailBiter.pair) });
  }

  const luckiest = [...rankings].sort((a, b) => b.luck - a.luck)[0];
  const unluckiest = [...rankings].sort((a, b) => a.luck - b.luck)[0];
  if (luckiest && luckiest.luck > 0.5) {
    lines.push({
      title: "Luckiest team",
      detail: `${luckiest.name} is ${luckiest.luck.toFixed(1)} wins above what their scoring deserves.`,
    });
  }
  if (unluckiest && unluckiest.luck < -0.5) {
    lines.push({
      title: "Most robbed",
      detail: `${unluckiest.name} is ${Math.abs(unluckiest.luck).toFixed(1)} wins below what their scoring deserves.`,
    });
  }
  if (rankings[0]) {
    lines.push({
      title: "Power ranking leader",
      detail: `${rankings[0].name} — ${rankings[0].powerScore.toFixed(1)} power score, ${rankings[0].pointsFor.toFixed(1)} points for.`,
    });
  }

  lines.push({ title: "Week", detail: `Through week ${week}.` });
  return lines;
}

/** Stable 32-bit seed from a string, so odds don't change between renders. */
function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
