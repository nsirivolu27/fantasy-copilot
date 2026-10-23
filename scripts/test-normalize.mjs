// Dependency-free checks on the Sleeper normalizers.
// Run: node --experimental-strip-types scripts/test-normalize.mjs
//
// These cover the logic most likely to be silently wrong: lineup-slot
// assignment, the split points fields, and defensive fallbacks.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assignRosterSpots,
  combinePoints,
  normalizeSlots,
  pickTeamName,
  readLeagueType,
  readWaiverType,
} from "../src/lib/platforms/sleeper/pure.ts";

const read = (f) => JSON.parse(readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8"));
const league = read("league.json");
const rosters = read("rosters.json");
const users = read("users.json");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("\nSleeper normalizers\n");

test("roster slots split starters from bench/IR", () => {
  const slots = normalizeSlots(league.roster_positions);
  assert.equal(slots.length, 16);
  assert.equal(slots.filter((s) => s.isStarter).length, 9);
  assert.equal(slots.filter((s) => !s.isStarter).length, 7);
  assert.equal(slots[0].code, "QB");
  assert.equal(slots[6].code, "FLEX");
  assert.equal(slots[6].isStarter, true);
  assert.equal(slots[15].code, "IR");
  assert.equal(slots[15].isStarter, false);
});

test("starters map to lineup slots in order", () => {
  const slots = normalizeSlots(league.roster_positions);
  const spots = assignRosterSpots(rosters[1], slots);
  const starters = spots.filter((s) => s.isStarter);
  assert.equal(starters.length, 9);
  assert.deepEqual(
    starters.map((s) => s.slot),
    ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"],
  );
  assert.equal(starters[0].platformPlayerId, "4881");
  assert.equal(starters[8].platformPlayerId, "DAL");
});

test('empty starter slots ("0") are dropped, not rostered', () => {
  const slots = normalizeSlots(league.roster_positions);
  const spots = assignRosterSpots(rosters[0], slots);
  assert.ok(!spots.some((s) => s.platformPlayerId === "0"));
  // Team 1 has an empty FLEX, so only 8 starters are filled.
  assert.equal(spots.filter((s) => s.isStarter).length, 8);
});

test("bench, IR and taxi are separated", () => {
  const slots = normalizeSlots(league.roster_positions);
  const spots = assignRosterSpots(rosters[0], slots);
  const bench = spots.filter((s) => !s.isStarter);
  assert.equal(bench.find((s) => s.platformPlayerId === "9003").slot, "IR");
  assert.equal(bench.find((s) => s.platformPlayerId === "9001").slot, "BN");
});

test("every rostered player appears exactly once", () => {
  const slots = normalizeSlots(league.roster_positions);
  const spots = assignRosterSpots(rosters[0], slots);
  const ids = spots.map((s) => s.platformPlayerId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, rosters[0].players.length);
});

test("an empty roster produces no spots instead of throwing", () => {
  const slots = normalizeSlots(league.roster_positions);
  assert.deepEqual(assignRosterSpots(rosters[2], slots), []);
  assert.deepEqual(assignRosterSpots({}, slots), []);
});

test("split points fields recombine correctly", () => {
  assert.equal(combinePoints(128, 42), 128.42);
  assert.equal(combinePoints(99, 8), 99.08);
  assert.equal(combinePoints(0, 0), 0);
  assert.equal(combinePoints(undefined, undefined), 0);
  assert.equal(combinePoints("bad", null), 0);
});

test("team name falls back through metadata -> handle -> generic", () => {
  assert.equal(pickTeamName(users[0].metadata.team_name, users[0].display_name, 1), "tech rejects");
  assert.equal(pickTeamName(undefined, users[1].display_name, 2), "jeet");
  assert.equal(pickTeamName("   ", "", 3), "Team 3");
  assert.equal(pickTeamName(null, null, 3), "Team 3");
});

test("league type and waiver system read from settings, not assumptions", () => {
  assert.deepEqual(readLeagueType(league.settings.type), { isKeeper: false, isDynasty: false });
  assert.deepEqual(readLeagueType(2), { isKeeper: false, isDynasty: true });
  assert.deepEqual(readLeagueType(1), { isKeeper: true, isDynasty: false });
  assert.equal(readWaiverType(league.settings.waiver_budget), "faab");
  assert.equal(readWaiverType(0), "rolling");
  assert.equal(readWaiverType(undefined), "rolling");
});

test("nothing about the league format is hardcoded", () => {
  // A superflex dynasty league must normalize with no code changes.
  const sf = normalizeSlots(["QB", "SUPER_FLEX", "RB", "WR", "TE", "BN", "BN", "TAXI"]);
  assert.equal(sf.filter((s) => s.isStarter).length, 5);
  assert.equal(sf.find((s) => s.code === "TAXI").isStarter, false);
  assert.equal(sf[1].code, "SUPER_FLEX");
});

console.log(`\n${passed} passing\n`);
