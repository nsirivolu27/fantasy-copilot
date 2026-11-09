import { normalizeLeague, normalizeMatchups, normalizePlayer, normalizeRosters, normalizeTeams, SleeperStateSchema, SleeperLeagueSchema, SleeperRosterSchema, SleeperUserSchema } from "./sleeper/normalize";
import type { NormalizedPlayer } from "./types";

type Read = (path: string) => Promise<unknown>;

/** Public, read-only transport for a static dashboard. Never sends credentials. */
async function readPublic(path: string): Promise<unknown> {
  const response = await fetch(`https://api.sleeper.app/v1${path}`, {
    signal: AbortSignal.timeout(20_000), cache: "no-store", credentials: "omit",
  });
  if (!response.ok) throw new Error(`Sleeper could not refresh (${response.status}). Try again shortly.`);
  const value: unknown = await response.json();
  if (value === null) throw new Error("Sleeper could not find this league. Check the league link.");
  return value;
}

export async function readBrowserLeague(leagueId: string, requestedWeek?: number, read: Read = readPublic) {
  if (!/^\d{10,25}$/.test(leagueId)) throw new Error("Enter a valid Sleeper league ID.");
  if (requestedWeek !== undefined && (!Number.isInteger(requestedWeek) || requestedWeek < 1 || requestedWeek > 18)) throw new Error("Choose a week from 1 to 18.");
  const base = `/league/${leagueId}`;
  const [rawLeague, rawState, rawRosters, rawUsers] = await Promise.all([
    read(base), read("/state/nfl"), read(`${base}/rosters`), read(`${base}/users`),
  ]);
  const state = SleeperStateSchema.parse(rawState);
  if (SleeperLeagueSchema.parse(rawLeague).sport !== "nfl") throw new Error("This dashboard currently supports Sleeper football leagues.");
  const league = normalizeLeague(rawLeague, Number(state.display_week ?? state.week ?? 0), state.season_type);
  if (league.platformLeagueId !== leagueId) throw new Error("Sleeper returned a different league.");
  if (league.sport !== "football") throw new Error("This dashboard currently supports Sleeper football leagues.");
  if (league.season !== state.season) league.currentWeek = 0;
  if (!Array.isArray(rawRosters) || !Array.isArray(rawUsers)) throw new Error("Sleeper returned incomplete league data.");
  const teams = normalizeTeams(rawRosters, rawUsers);
  if (!teams.length || new Set(teams.map(t => t.platformTeamId)).size !== teams.length) throw new Error("Sleeper returned incomplete team data.");
  const rosters = normalizeRosters(rawRosters, league.rosterSlots);
  const week = requestedWeek ?? league.currentWeek;
  const matchups = week > 0 && week <= 18 ? normalizeMatchups(await read(`${base}/matchups/${week}`), week) : [];
  if (matchups.some(m => !teams.some(t => t.platformTeamId === m.platformTeamId))) throw new Error("Sleeper returned scores for an unknown team.");
  return { league, teams, rosters, week, matchups };
}

/** Discover every current-season league and the rosters owned/co-owned by this account. */
export async function discoverSleeperTeams(username: string, read: Read = readPublic) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(username.trim())) throw new Error("Enter your Sleeper username.");
  const [rawUser, rawState] = await Promise.all([read(`/user/${encodeURIComponent(username.trim())}`), read("/state/nfl")]);
  const user = SleeperUserSchema.parse(rawUser);
  const state = SleeperStateSchema.parse(rawState);
  const season = state.league_season ?? state.season;
  const rawLeagues = await read(`/user/${user.user_id}/leagues/nfl/${season}`);
  if (!Array.isArray(rawLeagues)) throw new Error("Sleeper could not return this account’s leagues.");
  const leagues = rawLeagues.map(raw => SleeperLeagueSchema.parse(raw));
  const result: { leagueId: string; name: string; teamIds: string[] }[] = [];
  for (let offset = 0; offset < leagues.length; offset += 4) {
    const batch = await Promise.all(leagues.slice(offset, offset + 4).map(async league => {
      const raw = await read(`/league/${league.league_id}/rosters`);
      if (!Array.isArray(raw)) throw new Error(`Could not load teams in ${league.name}. Retry account sync.`);
      const mine = raw.filter(value => {
        const roster = SleeperRosterSchema.parse(value);
        const coOwners = value && typeof value === "object" ? (value as Record<string, unknown>).co_owners : undefined;
        return roster.owner_id === user.user_id || (Array.isArray(coOwners) && coOwners.includes(user.user_id));
      });
      return { leagueId: league.league_id, name: league.name.trim(), teamIds: mine.map(value => String(SleeperRosterSchema.parse(value).roster_id)) };
    }));
    result.push(...batch);
  }
  return { username: user.display_name ?? username, season, leagues: result };
}

let playerJob: Promise<Record<string, NormalizedPlayer>> | undefined;
let playerFetchedAt = 0;
const PLAYER_CACHE = "fantasy-copilot-players-v1";

/** Cache the dictionary across visits; Sleeper asks for at most one download a day. */
export async function readBrowserPlayers(): Promise<Record<string, NormalizedPlayer>> {
  if (playerJob && Date.now() - playerFetchedAt < 86_400_000) return playerJob;
  playerFetchedAt = Date.now();
  playerJob = (async () => {
    let cache: Cache | undefined;
    try {
      cache = await caches.open(PLAYER_CACHE);
      const hit = await cache.match("https://api.sleeper.app/v1/players/nfl");
      if (hit && Date.now() - Number(hit.headers.get("x-fetched-at")) < 86_400_000) return await hit.json() as Record<string, NormalizedPlayer>;
    } catch { /* Cache storage may be disabled. Keep an in-memory copy. */ }
    const response = await fetch("https://api.sleeper.app/v1/players/nfl", { signal: AbortSignal.timeout(60_000), credentials: "omit" });
    if (!response.ok) throw new Error("Player names are temporarily unavailable.");
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Player names are temporarily unavailable.");
    const players = Object.fromEntries(Object.entries(raw).map(([id, value]) => [id, normalizePlayer(id, value)]));
    try { await cache?.put("https://api.sleeper.app/v1/players/nfl", new Response(JSON.stringify(players), { headers: { "x-fetched-at": String(Date.now()) } })); } catch { /* Storage quota must not break scores. */ }
    return players;
  })();
  return playerJob;
}
