import { z } from "zod";
import { PlatformError } from "../types";
import {
  assignRosterSpots,
  combinePoints,
  normalizeSlots,
  pickTeamName,
  readLeagueType,
  readWaiverType,
} from "./pure";
import type {
  NormalizedLeague,
  NormalizedMatchup,
  NormalizedRosterSpot,
  NormalizedPlayer,
  NormalizedRoster,
  NormalizedSlot,
  NormalizedTeam,
} from "../types";

/**
 * Schemas are deliberately loose: we validate the handful of fields we depend
 * on and pass everything else through. A new field from Sleeper must never
 * break the sync, a missing critical field should fail loudly and clearly.
 */

const numberish = z.union([z.number(), z.string()]).transform((v) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
});

export const SleeperStateSchema = z.object({
  season: z.string(),
  week: numberish.optional(),
  display_week: numberish.optional(),
  season_type: z.string().optional(),
  league_season: z.string().optional(),
});

export const SleeperLeagueSchema = z.object({
  league_id: z.string(),
  name: z.string().default("Untitled league"),
  season: z.string(),
  sport: z.string().default("nfl"),
  status: z.string().optional(),
  total_rosters: numberish.optional(),
  roster_positions: z.array(z.string()).default([]),
  scoring_settings: z.record(z.number()).default({}),
  settings: z.record(z.any()).default({}),
});

export const SleeperUserSchema = z.object({
  user_id: z.string(),
  display_name: z.string().optional(),
  avatar: z.string().nullish(),
  metadata: z.record(z.any()).nullish(),
});

export const SleeperRosterSchema = z.object({
  roster_id: z.union([z.number(), z.string()]),
  owner_id: z.string().nullish(),
  players: z.array(z.string()).nullish(),
  starters: z.array(z.string()).nullish(),
  reserve: z.array(z.string()).nullish(),
  taxi: z.array(z.string()).nullish(),
  settings: z.record(z.any()).nullish(),
});

export type SleeperLeague = z.infer<typeof SleeperLeagueSchema>;
export type SleeperUser = z.infer<typeof SleeperUserSchema>;
export type SleeperRoster = z.infer<typeof SleeperRosterSchema>;

const matchupSchema = z.array(z.object({
  roster_id: z.union([z.number().int(), z.string().min(1)]),
  matchup_id: z.union([z.number().int(), z.string().min(1)]).nullable(),
  points: z.number().finite(),
  custom_points: z.number().finite().nullish(),
  starters: z.array(z.string()).nullish(),
  players: z.array(z.string()).nullish(),
}));

/** Validate the entire score snapshot so missing points never masquerade as zero. */
export function normalizeMatchups(raw: unknown, week: number): NormalizedMatchup[] {
  const parsed = matchupSchema.safeParse(raw);
  if (!parsed.success) throw new PlatformError("Sleeper matchup scores were not in the expected shape.", "bad_shape");
  const ids = parsed.data.map((row) => String(row.roster_id));
  if (new Set(ids).size !== ids.length) throw new PlatformError("Sleeper returned duplicate matchup scores.", "bad_shape");
  return parsed.data.map((row) => ({
    week,
    platformTeamId: String(row.roster_id),
    matchupId: row.matchup_id === null ? `bye:${row.roster_id}` : String(row.matchup_id),
    points: row.custom_points ?? row.points,
    starters: row.starters ?? undefined,
    players: row.players ?? undefined,
  }));
}

// The pure, dependency-free helpers live in pure.ts so they can be unit
// tested without Prisma/Next/zod. Re-exported here for convenience.
export { assignRosterSpots, combinePoints, normalizeSlots } from "./pure";

export function normalizeLeague(raw: unknown, week: number, seasonState?: string): NormalizedLeague {
  const parsed = SleeperLeagueSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PlatformError(
      `Sleeper league response was missing required fields: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`,
      "bad_shape",
    );
  }
  const l = parsed.data;
  const settings = l.settings ?? {};

  const { isKeeper, isDynasty } = readLeagueType(settings.type);
  const playoffWeekStart = Number(settings.playoff_week_start ?? 0);
  const playoffTeams = Number(settings.playoff_teams ?? 0);
  const waiverBudget = Number(settings.waiver_budget ?? 0);
  const waiverType = readWaiverType(settings.waiver_budget);

  const slots = normalizeSlots(l.roster_positions);

  return {
    platform: "sleeper",
    platformLeagueId: l.league_id,
    sport: "football",
    season: l.season,
    name: l.name,
    // Prefer the real roster count; fall back to total_rosters.
    teamCount: Number(l.total_rosters ?? 0),
    currentWeek: week,
    seasonState: seasonState ?? l.status,
    scoringSettings: l.scoring_settings ?? {},
    rosterSlots: slots,
    waiverType,
    waiverBudget: waiverBudget > 0 ? waiverBudget : undefined,
    isDynasty,
    isKeeper,
    playoffWeekStart: playoffWeekStart > 0 ? playoffWeekStart : undefined,
    playoffTeams: playoffTeams > 0 ? playoffTeams : undefined,
  };
}

export function normalizeTeams(rawRosters: unknown[], rawUsers: unknown[]): NormalizedTeam[] {
  const users = new Map<string, SleeperUser>();
  for (const u of rawUsers) {
    const parsed = SleeperUserSchema.safeParse(u);
    if (parsed.success) users.set(parsed.data.user_id, parsed.data);
  }

  const teams: NormalizedTeam[] = [];
  for (const r of rawRosters) {
    const parsed = SleeperRosterSchema.safeParse(r);
    if (!parsed.success) continue; // skip a malformed roster rather than fail the sync
    const roster = parsed.data;
    const rosterId = String(roster.roster_id);
    const owner = roster.owner_id ? users.get(roster.owner_id) : undefined;
    const s = roster.settings ?? {};

    // Team name lives in user metadata; falls back to the manager's handle,
    // then a generic label, so the UI never renders "undefined".
    const teamName = pickTeamName(
      (owner?.metadata as Record<string, unknown> | undefined)?.team_name,
      owner?.display_name,
      rosterId,
    );

    teams.push({
      platformTeamId: rosterId,
      name: teamName,
      ownerName: owner?.display_name ?? undefined,
      avatar: owner?.avatar ?? undefined,
      wins: Number(s.wins ?? 0),
      losses: Number(s.losses ?? 0),
      ties: Number(s.ties ?? 0),
      pointsFor: combinePoints(s.fpts, s.fpts_decimal),
      pointsAgainst: combinePoints(s.fpts_against, s.fpts_against_decimal),
      waiverBudgetUsed: s.waiver_budget_used != null ? Number(s.waiver_budget_used) : undefined,
    });
  }

  // Stable ordering: best record first, then points for.
  teams.sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  return teams;
}

export function normalizeRosters(rawRosters: unknown[], slots: NormalizedSlot[]): NormalizedRoster[] {
  return rawRosters.flatMap((r) => {
    const parsed = SleeperRosterSchema.safeParse(r);
    if (!parsed.success) return []; // skip a malformed roster rather than fail the sync
    const roster = parsed.data;
    return [
      {
        platformTeamId: String(roster.roster_id),
        spots: assignRosterSpots(
          {
            players: roster.players ?? undefined,
            starters: roster.starters ?? undefined,
            reserve: roster.reserve ?? undefined,
            taxi: roster.taxi ?? undefined,
          },
          slots,
        ) as NormalizedRosterSpot[],
      },
    ];
  });
}

/** Shapes one entry from Sleeper's player dictionary. Everything is optional. */
export function normalizePlayer(id: string, raw: unknown): NormalizedPlayer {
  const p = (raw ?? {}) as Record<string, unknown>;
  const first = typeof p.first_name === "string" ? p.first_name : "";
  const last = typeof p.last_name === "string" ? p.last_name : "";
  const full = typeof p.full_name === "string" && p.full_name.trim() ? p.full_name : `${first} ${last}`.trim();

  return {
    platformPlayerId: id,
    gsisId: typeof p.gsis_id === "string" && p.gsis_id ? p.gsis_id : undefined,
    // Team defenses have no name fields, their ID is the team code ("SF").
    fullName: full || (typeof p.team === "string" ? `${p.team} Defense` : `Player ${id}`),
    position: typeof p.position === "string" ? p.position : undefined,
    nflTeam: typeof p.team === "string" ? p.team : undefined,
    age: typeof p.age === "number" ? p.age : undefined,
    yearsExp: typeof p.years_exp === "number" ? p.years_exp : undefined,
    injuryStatus: typeof p.injury_status === "string" ? p.injury_status : undefined,
    injuryNote: typeof p.injury_notes === "string" ? p.injury_notes : undefined,
  };
}
