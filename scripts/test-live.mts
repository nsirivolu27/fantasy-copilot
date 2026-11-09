import assert from "node:assert/strict";
import { weeklyScoreboard } from "../src/lib/core/live.ts";
import { parseLeagueInput } from "../src/lib/live/input.ts";
import { normalizeMatchups } from "../src/lib/platforms/sleeper/normalize.ts";

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log(`  ok  ${name}`); }
test("all-play counts tied opponents without counting yourself", () => {
  const board = weeklyScoreboard([{ teamId: "a", points: 120 }, { teamId: "b", points: 120 }, { teamId: "c", points: 80 }]);
  assert.equal(board.median, 120);
  assert.deepEqual(board.teams.map((t) => [t.rank, t.wins, t.losses, t.ties]), [[1, 1, 0, 1], [1, 1, 0, 1], [3, 0, 2, 0]]);
});
test("even median, negative and zero scores are preserved", () => {
  const board = weeklyScoreboard([{ teamId: "a", points: 0 }, { teamId: "b", points: -2 }]);
  assert.equal(board.median, -1);
  assert.deepEqual(board.teams.map((t) => t.aboveMedian), [1, -1]);
});
test("no scores means missing analytics, not manufactured zero scores", () => {
  assert.deepEqual(weeklyScoreboard([]), { median: null, teams: [] });
});
test("duplicate or non-finite scores cannot produce a misleading comparison", () => {
  assert.throws(() => weeklyScoreboard([{ teamId: "a", points: NaN }]));
  assert.throws(() => weeklyScoreboard([{ teamId: "a", points: 1 }, { teamId: "a", points: 2 }]));
});
test("league URL parsing keeps large IDs as strings and rejects foreign hosts", () => {
  const id = "1124839284756483920";
  assert.equal(parseLeagueInput(`https://sleeper.com/leagues/${id}/matchup`), id);
  assert.equal(parseLeagueInput(` ${id} `), id);
  assert.equal(parseLeagueInput(`https://sleeper.com.evil.test/leagues/${id}`), null);
  assert.equal(parseLeagueInput("https://example.com/123"), null);
  assert.equal(parseLeagueInput(""), null);
});
test("commissioner zero overrides and byes remain real scores", () => {
  const rows = normalizeMatchups([{ roster_id: 1, matchup_id: 1, points: 100, custom_points: 0 }, { roster_id: 2, matchup_id: null, points: -1 }], 3);
  assert.equal(rows[0].points, 0);
  assert.equal(rows[1].matchupId, "bye:2");
  assert.equal(rows[1].points, -1);
});
test("malformed upstream scores fail instead of displaying zero", () => {
  assert.throws(() => normalizeMatchups([{ roster_id: 1, matchup_id: 1 }], 1));
  assert.throws(() => normalizeMatchups({ error: "unavailable" }, 1));
  assert.throws(() => normalizeMatchups([{ roster_id: 1, matchup_id: 1, points: Infinity }], 1));
});
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalFixtures = process.env.SLEEPER_FIXTURES;
process.env.SLEEPER_FIXTURES = "0";
let requests = 0;
let unavailable = false;
globalThis.fetch = async (input) => {
  requests++;
  if (unavailable) throw new Error("Upstream unavailable");
  const url = new URL(String(input));
  const id = url.pathname.split("/")[3];
  let body: unknown;
  if (url.pathname.endsWith("/state/nfl")) body = { season: "2026", week: 2 };
  else if (url.pathname.endsWith("/rosters")) body = [{ roster_id: 1, owner_id: "u1", settings: { wins: 1, fpts: 100 } }];
  else if (url.pathname.endsWith("/users")) body = [{ user_id: "u1", display_name: `Owner ${id}` }];
  else if (url.pathname.includes("/matchups/")) body = [{ roster_id: 1, matchup_id: null, points: 25 }];
  else body = { league_id: id, name: `League ${id}`, season: id === "3333333333333333333" ? "2024" : "2026", total_rosters: 1 };
  return new Response(JSON.stringify(body), { status: 200 });
};
try {
  const { getLiveSnapshot } = await import("../src/lib/live/service.ts");
  const [first, concurrent] = await Promise.all([getLiveSnapshot("1111111111111111111"), getLiveSnapshot("1111111111111111111")]);
  test("concurrent viewers share a refresh and fresh reads reuse it", () => {
    assert.equal(requests, 5);
    assert.equal(first.fetchedAt, concurrent.fetchedAt);
  });
  await getLiveSnapshot("1111111111111111111");
  assert.equal(requests, 5);
  const other = await getLiveSnapshot("2222222222222222222");
  test("two visitors' league links cannot overwrite each other's snapshot", () => {
    assert.notEqual(first.league.platformLeagueId, other.league.platformLeagueId);
    assert.notEqual(first.rankings[0].name, other.rankings[0].name);
  });
  const old = await getLiveSnapshot("3333333333333333333");
  test("historical leagues do not use the current season's week", () => {
    assert.equal(old.week, 0);
    assert.equal(old.scoreboard.median, null);
  });
  Date.now = () => originalNow() + 61_000;
  unavailable = true;
  const stale = await getLiveSnapshot("1111111111111111111");
  test("upstream failure preserves the old timestamp and scores and marks them stale", () => {
    assert.equal(stale.stale, true);
    assert.equal(stale.fetchedAt, first.fetchedAt);
    assert.deepEqual(stale.scoreboard, first.scoreboard);
  });
  await assert.rejects(() => getLiveSnapshot("4444444444444444444"));
  console.log("  ok  a failed new league does not receive a different league's cached data");
  passed++;
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  if (originalFixtures === undefined) delete process.env.SLEEPER_FIXTURES;
  else process.env.SLEEPER_FIXTURES = originalFixtures;
}
console.log(`\n${passed} live checks passing\n`);
