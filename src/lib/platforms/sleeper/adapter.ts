import { sleeperGet } from "./client";
import {
  SleeperStateSchema,
  normalizeLeague,
  normalizePlayer,
  normalizeRosters,
  normalizeTeams,
} from "./normalize";
import {
  PlatformError,
  type NormalizedLeague,
  type NormalizedMatchup,
  type NormalizedPlayer,
  type NormalizedRoster,
  type NormalizedTeam,
  type NormalizedTransaction,
  type PlatformAdapter,
} from "../types";

/**
 * Sleeper implementation of PlatformAdapter.
 * Read-only, no API key, no auth. Base URL: https://api.sleeper.app/v1
 */
export class SleeperAdapter implements PlatformAdapter {
  readonly platform = "sleeper" as const;

  /** Current season and week, straight from Sleeper. Never hardcoded. */
  async getNflState(): Promise<{ season: string; week: number; seasonType?: string }> {
    const raw = await sleeperGet<unknown>("/state/nfl");
    const parsed = SleeperStateSchema.safeParse(raw);
    if (!parsed.success) {
      throw new PlatformError("Sleeper's /state/nfl response was not in the expected shape.", "bad_shape");
    }
    const s = parsed.data;
    // display_week is what the app should show; week is the scoring week.
    const week = Number(s.display_week ?? s.week ?? 0);
    return { season: s.season, week, seasonType: s.season_type };
  }

  async getLeague(leagueId: string): Promise<NormalizedLeague> {
    const [raw, state] = await Promise.all([
      sleeperGet<unknown>(`/league/${encodeURIComponent(leagueId)}`),
      this.getNflState(),
    ]);
    return normalizeLeague(raw, state.week, state.seasonType);
  }

  async getTeams(leagueId: string): Promise<NormalizedTeam[]> {
    const [rosters, users] = await Promise.all([
      sleeperGet<unknown[]>(`/league/${encodeURIComponent(leagueId)}/rosters`),
      sleeperGet<unknown[]>(`/league/${encodeURIComponent(leagueId)}/users`),
    ]);
    return normalizeTeams(rosters ?? [], users ?? []);
  }

  async getRosters(leagueId: string): Promise<NormalizedRoster[]> {
    const [rosters, league] = await Promise.all([
      sleeperGet<unknown[]>(`/league/${encodeURIComponent(leagueId)}/rosters`),
      this.getLeague(leagueId),
    ]);
    return normalizeRosters(rosters ?? [], league.rosterSlots);
  }

  /**
   * Fetches metadata for specific players from the full dictionary.
   * Callers should prefer the cached path in playerCache.ts, this exists so
   * the adapter interface is complete and testable on its own.
   */
  async getPlayers(platformPlayerIds: string[]): Promise<NormalizedPlayer[]> {
    if (platformPlayerIds.length === 0) return [];
    const dict = await sleeperGet<Record<string, unknown>>("/players/nfl", { timeoutMs: 60_000 });
    return platformPlayerIds
      .filter((id) => dict?.[id] != null)
      .map((id) => normalizePlayer(id, dict[id]));
  }

  // ---- Declared now, implemented in a later phase -------------------------

  /**
   * Weekly matchups. Sleeper returns one row per roster; rows sharing a
   * matchup_id are playing each other. A row with a null matchup_id is a team
   * on bye in a league with an odd number of teams.
   */
  async getMatchups(leagueId: string, week: number): Promise<NormalizedMatchup[]> {
    const rows = await sleeperGet<unknown[]>(
      `/league/${encodeURIComponent(leagueId)}/matchups/${week}`,
    );

    const out: NormalizedMatchup[] = [];
    for (const raw of rows ?? []) {
      const row = raw as { roster_id?: number | string; matchup_id?: number | string; points?: number };
      if (row.roster_id == null || row.matchup_id == null) continue;
      const points = Number(row.points ?? 0);
      out.push({
        week,
        platformTeamId: String(row.roster_id),
        matchupId: String(row.matchup_id),
        points: Number.isFinite(points) ? points : 0,
      });
    }
    return out;
  }

  /** Adds, drops and trades for one waiver round. Not yet surfaced in the UI. */
  async getTransactions(leagueId: string, week: number): Promise<NormalizedTransaction[]> {
    const rows = await sleeperGet<unknown[]>(
      `/league/${encodeURIComponent(leagueId)}/transactions/${week}`,
    );

    const TYPES = new Set(["waiver", "free_agent", "trade", "commissioner"]);
    return (rows ?? []).map((raw) => {
      const row = raw as {
        transaction_id?: string;
        type?: string;
        status?: string;
        adds?: Record<string, number> | null;
        drops?: Record<string, number> | null;
        settings?: { waiver_bid?: number } | null;
        created?: number;
      };
      const shape = (map: Record<string, number> | null | undefined) =>
        Object.entries(map ?? {}).map(([platformPlayerId, rosterId]) => ({
          platformPlayerId,
          platformTeamId: String(rosterId),
        }));

      return {
        platformTransactionId: row.transaction_id ?? "",
        week,
        type: (TYPES.has(row.type ?? "") ? row.type : "unknown") as NormalizedTransaction["type"],
        status: row.status ?? "unknown",
        adds: shape(row.adds),
        drops: shape(row.drops),
        faabSpent: row.settings?.waiver_bid,
        createdAt: row.created ? new Date(row.created) : undefined,
      };
    });
  }

  /**
   * Everyone at a fantasy position who isn't on a roster in this league.
   *
   * The dictionary is large, so this filters hard: rostered players out, then
   * only players with an NFL team (free agents in real life are not fantasy
   * options) at a position the league actually starts.
   */
  async getFreeAgents(leagueId: string): Promise<NormalizedPlayer[]> {
    const [rosters, dict] = await Promise.all([
      sleeperGet<unknown[]>(`/league/${encodeURIComponent(leagueId)}/rosters`),
      sleeperGet<Record<string, unknown>>("/players/nfl", { timeoutMs: 60_000 }),
    ]);

    const rostered = new Set<string>();
    for (const raw of rosters ?? []) {
      const players = (raw as { players?: string[] | null })?.players ?? [];
      for (const id of players) if (id) rostered.add(id);
    }

    const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);
    const out: NormalizedPlayer[] = [];

    for (const [id, raw] of Object.entries(dict ?? {})) {
      if (rostered.has(id)) continue;
      const record = raw as Record<string, unknown>;
      const position = typeof record.position === "string" ? record.position : "";
      if (!FANTASY_POSITIONS.has(position)) continue;
      // No NFL team means not on a roster in real life either.
      if (!record.team) continue;
      out.push(normalizePlayer(id, raw));
    }

    return out;
  }
}
