import { readBrowserLeague } from "@/lib/platforms/browser";
import { powerRankings } from "@/lib/core/league";
import { weeklyScoreboard } from "@/lib/core/live";

export async function loadDashboard(leagueId: string, week?: number) {
  const source = await readBrowserLeague(leagueId, week);
  return {
    ...source,
    rankings: powerRankings(source.teams.map(team => ({ ...team, teamId: team.platformTeamId }))),
    scoreboard: weeklyScoreboard(source.matchups.map(row => ({ teamId: row.platformTeamId, points: row.points }))),
    fetchedAt: new Date().toISOString(),
  };
}
export type DashboardSnapshot = Awaited<ReturnType<typeof loadDashboard>>;
