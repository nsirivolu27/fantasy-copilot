import { readDemoLeague, readDemoPlayers } from "@/lib/platforms/demo";
import { weeklyScoreboard } from "@/lib/core/live";
import { powerRankings } from "@/lib/core/league";

export async function loadDemoDashboard() {
  const source = await readDemoLeague();
  return { ...source, rankings: powerRankings(source.teams.map(t => ({ ...t, teamId: t.platformTeamId }))),
    scoreboard: weeklyScoreboard(source.matchups.map(t => ({ teamId: t.platformTeamId, points: t.points }))), fetchedAt: new Date().toISOString() };
}
export const demoPlayers = readDemoPlayers;
