// Status lights are the part of the board most likely to lie, so these tests
// are mostly about refusing to.

import assert from "node:assert/strict";
import {
  gameIsLive,
  indexGamesByTeam,
  normalizeTeam,
  readGameState,
  statusForPlayer,
  statusLabel,
} from "../src/lib/core/gameStatus.ts";

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

const games = [
  { homeTeam: "SF", awayTeam: "SEA", state: "in_progress", detail: "Q3 04:12" },
  { homeTeam: "KC", awayTeam: "BUF", state: "final" },
  { homeTeam: "DAL", awayTeam: "PHI", state: "scheduled", kickoff: "2026-09-20T17:00:00Z" },
];
const lookup = { byTeam: indexGamesByTeam(games), feedAvailable: true };

test("a feed's own vocabulary is reduced, and anything unrecognised is unknown", () => {
  assert.equal(readGameState("pre"), "scheduled");
  assert.equal(readGameState("STATUS_IN_PROGRESS"), "in_progress");
  assert.equal(readGameState("post"), "final");
  assert.equal(readGameState("halftime"), "unknown", "a state we have not seen is not bucketed into the nearest guess");
  assert.equal(readGameState(undefined), "unknown");
  assert.equal(readGameState(3), "unknown");
});

test("a team is matched whichever side of the game it is on", () => {
  assert.equal(statusForPlayer("SF", lookup).state, "in_progress");
  assert.equal(statusForPlayer("SEA", lookup).state, "in_progress");
  assert.equal(statusForPlayer("sea", lookup).state, "in_progress", "case and spacing do not decide a status");
  assert.equal(statusForPlayer(" KC ", lookup).state, "final");
});

test("the opponent and home side come from the matched game, not from the caller", () => {
  const away = statusForPlayer("SEA", lookup);
  assert.equal(away.opponent, "SF");
  assert.equal(away.atHome, false);
  const home = statusForPlayer("SF", lookup);
  assert.equal(home.opponent, "SEA");
  assert.equal(home.atHome, true);
});

test("a player with no team is unknown, and says which kind of unknown", () => {
  assert.deepEqual(statusForPlayer(undefined, lookup), { state: "unknown", reason: "no_team" });
  assert.deepEqual(statusForPlayer("  ", lookup), { state: "unknown", reason: "no_team" });
});

test("a team with no game this week is unknown rather than final", () => {
  const status = statusForPlayer("NYJ", lookup);
  assert.equal(status.state, "unknown");
  assert.equal(status.reason, "no_game");
});

test("a bye is a known state, not a missing one", () => {
  const withBye = { ...lookup, byeTeams: new Set(["NYJ"]) };
  assert.equal(statusForPlayer("NYJ", withBye).state, "bye");
});

test("an unreadable feed makes every player unavailable, not every player bye", () => {
  const down = { byTeam: new Map(), feedAvailable: false };
  for (const team of ["SF", "NYJ", undefined]) {
    const status = statusForPlayer(team, down);
    assert.equal(status.state, "unknown");
    assert.equal(status.reason, "feed_unavailable", "a league-wide grey must read as our failure, not as a bye week");
  }
});

test("every state carries words, because colour is not a signal on its own", () => {
  assert.equal(statusLabel(statusForPlayer("SF", lookup)), "Live · Q3 04:12");
  assert.equal(statusLabel(statusForPlayer("KC", lookup)), "Final");
  assert.equal(statusLabel(statusForPlayer("DAL", lookup)), "Scheduled");
  assert.equal(statusLabel({ state: "bye" }), "Bye");
  assert.equal(statusLabel({ state: "unknown", reason: "no_game" }), "No game");
  assert.equal(statusLabel({ state: "unknown", reason: "feed_unavailable" }), "Status unavailable");
});

test("a live game is the only thing that reads as live", () => {
  assert.equal(gameIsLive(statusForPlayer("SF", lookup)), true);
  for (const state of ["scheduled", "final", "bye", "unknown"]) {
    assert.equal(gameIsLive({ state }), false);
  }
});

test("points never reach this module, so they cannot imply a state", () => {
  // The signature is the guarantee: statusForPlayer takes a team and a
  // schedule. There is nowhere to pass a score, which is the point.
  assert.equal(statusForPlayer.length, 2);
  const source = statusForPlayer.toString();
  assert.equal(/point|score|fpts/i.test(source), false, "no scoring vocabulary inside the status path");
});

test("normalizeTeam is the one place abbreviations are cleaned", () => {
  assert.equal(normalizeTeam(" sf "), "SF");
  assert.equal(normalizeTeam(undefined), "");
});

console.log(`\n${passed} passing\n`);
