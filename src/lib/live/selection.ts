import type { LiveSnapshot } from "./service";

/** Filter after computing comparisons so selected teams keep their league-wide rank. */
export function selectLiveTeams(snapshot: LiveSnapshot & { stale: boolean }, teamIds: string[]) {
  const ids = new Set(teamIds);
  if (teamIds.some(id => !snapshot.rankings.some(team => team.teamId === id))) throw new Error("A selected team does not belong to this league.");
  return {
    league: snapshot.league,
    week: snapshot.week,
    selectedTeamIds: [...ids],
    rankings: snapshot.rankings.filter(team => ids.has(team.teamId)),
    matchups: snapshot.matchups.filter(team => ids.has(team.platformTeamId)),
    scoreboard: { median: snapshot.scoreboard.median, teams: snapshot.scoreboard.teams.filter(team => ids.has(team.teamId)) },
    fetchedAt: snapshot.fetchedAt,
    stale: snapshot.stale,
    fixture: snapshot.fixture,
  };
}
