// Normalized, platform-agnostic types.
//
// Everything outside lib/platforms/ talks to THESE types only. Adding Yahoo or
// NFL.com later means writing one new adapter file — no changes to the app.

export type PlatformId = "sleeper" | "espn" | "manual";
export type SportId = "football" | "basketball" | "baseball";

/** A roster slot as the league defines it, in lineup order. */
export interface NormalizedSlot {
  /** "QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX", "K", "DEF", "BN", "IR", "TAXI" */
  code: string;
  /** Position within the full roster_positions array — preserves lineup order. */
  index: number;
  isStarter: boolean;
}

export interface NormalizedLeague {
  platform: PlatformId;
  platformLeagueId: string;
  sport: SportId;
  season: string;
  name: string;
  teamCount: number;
  currentWeek: number;
  seasonState?: string;
  /** Raw scoring map straight from the platform, e.g. { rec: 1, pass_td: 4 }. */
  scoringSettings: Record<string, number>;
  rosterSlots: NormalizedSlot[];
  waiverType?: "faab" | "rolling";
  waiverBudget?: number;
  isDynasty: boolean;
  isKeeper: boolean;
}

export interface NormalizedTeam {
  platformTeamId: string;
  name: string;
  ownerName?: string;
  avatar?: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  waiverBudgetUsed?: number;
}

export interface NormalizedPlayer {
  platformPlayerId: string;
  fullName: string;
  position?: string;
  nflTeam?: string;
  age?: number;
  yearsExp?: number;
  injuryStatus?: string;
  injuryNote?: string;
  byeWeek?: number;
}

export interface NormalizedRosterSpot {
  platformPlayerId: string;
  slot: string;
  slotIndex?: number;
  isStarter: boolean;
}

export interface NormalizedRoster {
  platformTeamId: string;
  spots: NormalizedRosterSpot[];
}

export interface NormalizedMatchup {
  week: number;
  platformTeamId: string;
  /** Teams sharing a matchupId play each other. */
  matchupId: string;
  points: number;
}

export interface NormalizedTransaction {
  platformTransactionId: string;
  week: number;
  type: "waiver" | "free_agent" | "trade" | "commissioner" | "unknown";
  status: string;
  adds: { platformPlayerId: string; platformTeamId: string }[];
  drops: { platformPlayerId: string; platformTeamId: string }[];
  faabSpent?: number;
  createdAt?: Date;
}

/**
 * The one interface the app depends on.
 *
 * Phase 1 implements getLeague / getTeams / getRosters / getPlayers.
 * getMatchups / getTransactions / getFreeAgents are declared now so later
 * phases have a fixed contract; unimplemented ones throw NotImplementedError.
 */
export interface PlatformAdapter {
  readonly platform: PlatformId;

  getLeague(leagueId: string): Promise<NormalizedLeague>;
  getTeams(leagueId: string): Promise<NormalizedTeam[]>;
  getRosters(leagueId: string): Promise<NormalizedRoster[]>;

  /** Metadata for the given platform player IDs. May return fewer than asked. */
  getPlayers(platformPlayerIds: string[]): Promise<NormalizedPlayer[]>;

  getMatchups(leagueId: string, week: number): Promise<NormalizedMatchup[]>;
  getTransactions(leagueId: string, week: number): Promise<NormalizedTransaction[]>;
  getFreeAgents(leagueId: string): Promise<NormalizedPlayer[]>;
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented until a later phase.`);
    this.name = "NotImplementedError";
  }
}

/** Thrown for any upstream failure so the sync layer can report it cleanly. */
export class PlatformError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "unauthorized"
      | "rate_limited"
      | "network"
      | "bad_shape"
      | "unknown" = "unknown",
    readonly status?: number,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}
