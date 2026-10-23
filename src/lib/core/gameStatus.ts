// Whether a player's NFL game is happening, as a fact rather than a guess.
//
// The rule this module exists to enforce: fantasy points never imply a game
// state. A player can score 18 points on Sunday and still be sitting at home
// on Monday night, and a live game can sit at zero for a quarter. Reading
// "live" off a nonzero score is the mistake that makes a status light worse
// than no status light, because it is confidently wrong.
//
// So the only input here is a game's own reported state, joined to a player by
// NFL team. Anything that does not join cleanly is `unknown`, which the board
// renders as "unavailable" rather than picking a colour.
//
// Pure on purpose: no fetch, no zod, no imports. The adapter that actually
// talks to a scoreboard feed lives outside core and hands its rows in here, so
// this mapping is testable without a network.

/**
 * What is happening to the game itself.
 *
 * `bye` is separate from `none` because a bye is known and explainable, while
 * `none` means the schedule had nothing for this team and we do not know why.
 */
export type GameState = "scheduled" | "in_progress" | "final" | "bye" | "unknown";

/** A game as a scoreboard feed reports it, reduced to what a status light needs. */
export interface GameRow {
  /** Uppercase NFL abbreviation, e.g. "SF". */
  homeTeam: string;
  awayTeam: string;
  /** The feed's own state, already reduced to our vocabulary by the adapter. */
  state: GameState;
  /** Kickoff in ISO 8601, when the feed gives one. Display only. */
  kickoff?: string;
  /** Short human label from the feed, e.g. "Q3 04:12" or "Final". */
  detail?: string;
}

export interface PlayerGameStatus {
  /** The state to show. Never derived from points. */
  state: GameState;
  /** The other team, when a game was matched. */
  opponent?: string;
  /** True when the player's team is at home. Undefined when unmatched. */
  atHome?: boolean;
  kickoff?: string;
  detail?: string;
  /**
   * Why this is `unknown`, for the caption under the board. A status light
   * that cannot say why it is grey teaches nobody anything.
   */
  reason?: "no_team" | "no_game" | "feed_unavailable";
}

const UNKNOWN_NO_TEAM: PlayerGameStatus = { state: "unknown", reason: "no_team" };
const UNKNOWN_NO_GAME: PlayerGameStatus = { state: "unknown", reason: "no_game" };
const UNAVAILABLE: PlayerGameStatus = { state: "unknown", reason: "feed_unavailable" };

/**
 * Reduce a scoreboard feed's own status vocabulary to ours.
 *
 * Feeds use `pre`/`in`/`post`, or `STATUS_SCHEDULED`/`STATUS_IN_PROGRESS`/
 * `STATUS_FINAL`, or similar. Anything unrecognised becomes `unknown` rather
 * than being bucketed into the nearest guess, because a new value we have not
 * seen is exactly the case where guessing goes wrong.
 */
export function readGameState(raw: unknown): GameState {
  if (typeof raw !== "string") return "unknown";
  const value = raw.trim().toLowerCase();
  if (value === "pre" || value === "status_scheduled" || value === "scheduled") return "scheduled";
  if (value === "in" || value === "status_in_progress" || value === "in_progress") return "in_progress";
  if (value === "post" || value === "status_final" || value === "final") return "final";
  return "unknown";
}

/** Normalize an abbreviation so "sf", " SF " and "SF" are one team. */
export function normalizeTeam(team: string | undefined): string {
  return (team ?? "").trim().toUpperCase();
}

/**
 * Index the week's games by team, so a roster of fifteen players costs one
 * pass over the schedule rather than fifteen.
 *
 * A team appearing in two rows keeps the first. That should not happen in a
 * single week, and if a feed ever does it, silently preferring one is better
 * than throwing in the middle of rendering a board.
 */
export function indexGamesByTeam(games: readonly GameRow[]): Map<string, GameRow> {
  const byTeam = new Map<string, GameRow>();
  for (const game of games) {
    for (const team of [normalizeTeam(game.homeTeam), normalizeTeam(game.awayTeam)]) {
      if (team && !byTeam.has(team)) byTeam.set(team, game);
    }
  }
  return byTeam;
}

export interface StatusLookup {
  /** The week's games, indexed by team. */
  byTeam: ReadonlyMap<string, GameRow>;
  /**
   * Teams on bye this week, so a missing game can be explained rather than
   * reported as unknown. Derived from the league's own schedule, not guessed.
   */
  byeTeams?: ReadonlySet<string>;
  /**
   * False when the feed could not be read at all. Every player then reports
   * `feed_unavailable`, which is honest, instead of every player reporting
   * `no_game`, which would read as a league-wide bye.
   */
  feedAvailable: boolean;
}

/** The status to show for one player, given the week's games. */
export function statusForPlayer(nflTeam: string | undefined, lookup: StatusLookup): PlayerGameStatus {
  if (!lookup.feedAvailable) return UNAVAILABLE;

  const team = normalizeTeam(nflTeam);
  // A free agent, or a defense the platform did not tag with a team. There is
  // no game to look up, and that is a fact rather than a failure.
  if (!team) return UNKNOWN_NO_TEAM;

  if (lookup.byeTeams?.has(team)) return { state: "bye" };

  const game = lookup.byTeam.get(team);
  if (!game) return UNKNOWN_NO_GAME;

  const atHome = normalizeTeam(game.homeTeam) === team;
  const opponent = atHome ? normalizeTeam(game.awayTeam) : normalizeTeam(game.homeTeam);
  return {
    state: game.state,
    opponent,
    atHome,
    ...(game.kickoff ? { kickoff: game.kickoff } : {}),
    ...(game.detail ? { detail: game.detail } : {}),
  };
}

/**
 * The words next to the light.
 *
 * Every state has one, because colour alone is not a signal: the board is read
 * by people who cannot distinguish the hues, and by everyone else on a phone
 * in daylight.
 */
export function statusLabel(status: PlayerGameStatus): string {
  switch (status.state) {
    case "in_progress":
      return status.detail ? `Live \u00b7 ${status.detail}` : "Live";
    case "final":
      return "Final";
    case "scheduled":
      return "Scheduled";
    case "bye":
      return "Bye";
    default:
      return status.reason === "feed_unavailable" ? "Status unavailable" : "No game";
  }
}

/**
 * Whether a player being on the field is a separate question from the game
 * being live, and one this data cannot answer.
 *
 * A scoreboard feed says the game is in progress. It does not say whether this
 * particular player has taken a snap, is inactive, or is on the sideline in
 * street clothes. Callers that want to say "playing" must get that from the
 * roster's own inactive list, not from here.
 */
export function gameIsLive(status: PlayerGameStatus): boolean {
  return status.state === "in_progress";
}
