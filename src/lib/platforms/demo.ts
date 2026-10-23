import league from "../../../fixtures/league.json";
import state from "../../../fixtures/state.json";
import rosters from "../../../fixtures/rosters.json";
import users from "../../../fixtures/users.json";
import matchups from "../../../fixtures/matchups.json";
import players from "../../../fixtures/players.json";
import { readBrowserLeague } from "./browser";
import { normalizePlayer } from "./sleeper/normalize";

export async function readDemoLeague() {
  return readBrowserLeague(league.league_id, undefined, async path => {
    if (path.endsWith("/state/nfl")) return state;
    if (path.endsWith("/rosters")) return rosters;
    if (path.endsWith("/users")) return users;
    if (path.includes("/matchups/")) return matchups;
    return league;
  });
}
export function readDemoPlayers() {
  return Object.fromEntries(Object.entries(players).map(([id, raw]) => [id, normalizePlayer(id, raw)]));
}
