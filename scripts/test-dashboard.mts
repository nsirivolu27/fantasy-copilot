import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { discoverSleeperTeams, readBrowserLeague } from "../src/lib/platforms/browser.ts";
import { DashboardProfileSchema, parseProfiles, parseTeamSelection, safeAppUrl, shareQuery } from "../src/lib/live/profile.ts";
import { selectLiveTeams } from "../src/lib/live/selection.ts";
import { weeklyScoreboard, scoreShare } from "../src/lib/core/live.ts";
import { powerRankings } from "../src/lib/core/league.ts";
import { mcpInputSchema } from "../src/lib/tools/mcpSchema.ts";
import { createMcpHandler } from "mcp-handler";

let passed = 0;
async function test(name: string, fn: () => unknown) { await fn(); passed++; console.log(`  ok  ${name}`); }
const fixtures = Object.fromEntries(await Promise.all(["league", "rosters", "users", "state", "matchups"].map(async name => [name, JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"))])));
const read = async (path: string) => path.endsWith("/state/nfl") ? fixtures.state : path.endsWith("/rosters") ? fixtures.rosters : path.endsWith("/users") ? fixtures.users : path.includes("/matchups/") ? fixtures.matchups : fixtures.league;
const leagueId = fixtures.league.league_id;
const source = await readBrowserLeague(leagueId, undefined, read);
const snapshot = { ...source, rankings: powerRankings(source.teams.map(t => ({ ...t, teamId: t.platformTeamId }))), scoreboard: weeklyScoreboard(source.matchups.map(t => ({ teamId: t.platformTeamId, points: t.points }))), fetchedAt: new Date().toISOString(), fixture: true, stale: false };

await test("score bar does not imply a probability or divide by zero", () => {
  assert.equal(scoreShare(30, 70), 30); assert.equal(scoreShare(0, 0), null); assert.equal(scoreShare(-1, 10), null);
});

await test("selected MCP view includes no other team's scores, ranking, or lineup", () => {
  const selected = selectLiveTeams(snapshot, ["1"]);
  assert.deepEqual(selected.rankings.map(t => t.teamId), ["1"]);
  assert.deepEqual(selected.matchups.map(t => t.platformTeamId), ["1"]);
  assert.deepEqual(selected.scoreboard.teams.map(t => t.teamId), ["1"]);
  assert.equal(selected.scoreboard.median, snapshot.scoreboard.median);
  assert.equal(selected.fetchedAt, snapshot.fetchedAt);
});
await test("empty selection never expands to all teams; invalid teams fail closed", () => {
  const empty = selectLiveTeams(snapshot, []);
  assert.equal(empty.rankings.length + empty.matchups.length + empty.scoreboard.teams.length, 0);
  assert.throws(() => selectLiveTeams(snapshot, ["9999"]));
  assert.deepEqual(parseTeamSelection(""), []);
  assert.equal(parseTeamSelection(null), null);
  assert.throws(() => parseTeamSelection("1,not-a-team"));
});
await test("portable profile strips credentials and unrelated input, and preserves an empty selection", () => {
  const profile = DashboardProfileSchema.parse({ version: 1, platform: "sleeper", leagueId, name: "Mine", teamIds: [], token: "secret", appUrl: "javascript:alert(1)" });
  assert.equal("token" in profile, false); assert.equal("appUrl" in profile, false);
  assert.equal(new URLSearchParams(shareQuery(profile)).get("teams"), "");
  assert.deepEqual(parseProfiles("[]"), []);
  assert.deepEqual(parseProfiles("broken"), []);
  assert.equal(safeAppUrl("javascript:alert(1)"), null);
  assert.equal(safeAppUrl("https://user:secret@example.com"), null);
});
await test("historical league requires an explicit week and never borrows the current season", async () => {
  const old = await readBrowserLeague(leagueId, undefined, async path => path === `/league/${leagueId}` ? { ...fixtures.league, season: "2024" } : read(path));
  assert.equal(old.week, 0); assert.deepEqual(old.matchups, []);
});
await test("a response for a different league is rejected", async () => {
  await assert.rejects(() => readBrowserLeague("9999999999999999999", undefined, read), /different league/);
});
await test("account discovery handles more than fifty leagues and owned/co-owned teams", async () => {
  const leagues = Array.from({ length: 53 }, (_, i) => ({ ...fixtures.league, league_id: String(BigInt(leagueId) + BigInt(i)) }));
  const account = await discoverSleeperTeams("my-account", async path => {
    if (path === "/user/my-account") return { user_id: "mine", display_name: "Manager" };
    if (path.endsWith("/state/nfl")) return { season: "2025", league_season: "2026", week: 1 };
    if (path === "/user/mine/leagues/nfl/2026") return leagues;
    if (path.endsWith("/rosters")) return [{ roster_id: 1, owner_id: "mine" }, { roster_id: 2, owner_id: "someone", co_owners: ["mine"] }, { roster_id: 3, owner_id: "someone" }];
    throw new Error(`Unexpected request ${path}`);
  });
  assert.equal(account.leagues.length, 53); assert.equal(account.season, "2026");
  assert.deepEqual(account.leagues[52].teamIds, ["1", "2"]);
});
await test("MCP handler advertises the registry schema and validates required selections", async () => {
  const schema = { type: "object" as const, properties: { team_ids: { type: "string", description: "Chosen teams" } }, required: ["team_ids"] };
  const adapted = mcpInputSchema(schema);
  assert.ok(adapted["~standard"].validate({}).issues);
  assert.deepEqual(adapted["~standard"].validate({ team_ids: "" }).value, { team_ids: "" });
  const handler = createMcpHandler(server => {
    server.registerTool("dashboard", { inputSchema: adapted }, async () => ({ content: [{ type: "text", text: "ok" }] }));
  });
  const response = await handler(new Request("https://example.com/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) }));
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /team_ids/); assert.match(body, /required/);
});
console.log(`\n${passed} dashboard checks passing\n`);
