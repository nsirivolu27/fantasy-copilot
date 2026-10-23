import { getAdapter } from "@/lib/platforms";
import { powerRankings } from "@/lib/core/league";
import { weeklyScoreboard } from "@/lib/core/live";

const CACHE_MS = 60_000;
const snapshots = new Map<string, LiveSnapshot>();
const pending = new Map<string, Promise<LiveSnapshot>>();

async function loadSnapshot(leagueId: string, requestedWeek?: number) {
  const adapter = getAdapter("sleeper");
  const [league, teams] = await Promise.all([adapter.getLeague(leagueId), adapter.getTeams(leagueId)]);
  const week = requestedWeek ?? league.currentWeek;
  const matchups = week > 0 ? await adapter.getMatchups(leagueId, week) : [];
  const teamIds = new Set(teams.map((team) => team.platformTeamId));
  if (teams.length === 0) throw new Error("Sleeper returned no teams for this league.");
  if (matchups.some((row) => !teamIds.has(row.platformTeamId))) throw new Error("Sleeper returned scores for an unknown team. Try again shortly.");
  return {
    league, week,
    rankings: powerRankings(teams.map((team) => ({ ...team, teamId: team.platformTeamId }))),
    matchups,
    scoreboard: weeklyScoreboard(matchups.map((row) => ({ teamId: row.platformTeamId, points: row.points }))),
    fetchedAt: new Date().toISOString(),
    fixture: process.env.SLEEPER_FIXTURES === "1",
  };
}

export type LiveSnapshot = Awaited<ReturnType<typeof loadSnapshot>>;

/** Bounded, per-league cache. Concurrent viewers share one upstream refresh. */
export async function getLiveSnapshot(leagueId: string, week?: number) {
  const key = `${leagueId}:${week ?? "current"}`;
  const cached = snapshots.get(key);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_MS) return { ...cached, stale: false };
  try {
    let job = pending.get(key);
    if (!job) {
      if (pending.size >= 20) throw new Error("The live service is busy. Please retry in a minute.");
      job = loadSnapshot(leagueId, week).then((snapshot) => {
        snapshots.delete(key);
        if (snapshots.size >= 100) snapshots.delete(snapshots.keys().next().value!);
        snapshots.set(key, snapshot);
        return snapshot;
      }).finally(() => pending.delete(key));
      pending.set(key, job);
    }
    return { ...await job, stale: false };
  } catch (error) {
    if (cached) return { ...cached, stale: true };
    throw error;
  }
}
