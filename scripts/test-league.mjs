// Power rankings, matchup simulation, playoff odds.
// Run: node --experimental-strip-types scripts/test-league.mjs
import assert from "node:assert/strict";
import {
  createRng,
  powerRankings,
  simulateMatchup,
  playoffOdds,
} from "../src/lib/core/league.ts";

let passed = 0;
const test = (n, fn) => { fn(); passed++; console.log(`  ok  ${n}`); };

console.log("\nLeague math\n");

test("the RNG is deterministic for a given seed", () => {
  const a = createRng(123);
  const b = createRng(123);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every((n) => n >= 0 && n < 1));
  assert.notDeepEqual(seqA, [createRng(124)(), 0, 0].slice(0, 1).concat(seqA.slice(1)));
});

// Team A scores the most but has lost more than it should, unlucky.
const TEAMS = [
  { teamId: "a", name: "Unlucky", wins: 2, losses: 4, ties: 0, pointsFor: 780, pointsAgainst: 700 },
  { teamId: "b", name: "Lucky", wins: 5, losses: 1, ties: 0, pointsFor: 600, pointsAgainst: 610 },
  { teamId: "c", name: "Middle", wins: 3, losses: 3, ties: 0, pointsFor: 690, pointsAgainst: 680 },
  { teamId: "d", name: "Bad", wins: 2, losses: 4, ties: 0, pointsFor: 540, pointsAgainst: 720 },
];

test("power rankings separate strength from record", () => {
  const ranked = powerRankings(TEAMS);
  const unlucky = ranked.find((t) => t.teamId === "a");
  const lucky = ranked.find((t) => t.teamId === "b");
  assert.ok(
    unlucky.rank < lucky.rank,
    `the highest-scoring team should outrank the luckiest: ${unlucky.rank} vs ${lucky.rank}`,
  );
});

test("luck is actual wins minus expected wins", () => {
  const ranked = powerRankings(TEAMS);
  assert.ok(ranked.find((t) => t.teamId === "a").luck < 0, "the top scorer at 2-4 is unlucky");
  assert.ok(ranked.find((t) => t.teamId === "b").luck > 0, "a 5-1 team scoring third is lucky");
});

test("ranks are 1..n with no gaps or ties", () => {
  const ranked = powerRankings(TEAMS);
  assert.deepEqual(ranked.map((t) => t.rank), [1, 2, 3, 4]);
});

test("an empty league returns an empty ranking rather than throwing", () => {
  assert.deepEqual(powerRankings([]), []);
});

// -- Simulation ---------------------------------------------------------------

const strong = Array.from({ length: 9 }, () => ({ projectedPoints: 15, floor: 10, ceiling: 20 }));
const weak = Array.from({ length: 9 }, () => ({ projectedPoints: 10, floor: 6, ceiling: 14 }));

test("the better lineup is favoured, but not certain", () => {
  const odds = simulateMatchup(strong, weak, { iterations: 3000, seed: 1 });
  assert.ok(odds.winProbability > 0.8, `expected a heavy favourite, got ${odds.winProbability}`);
  assert.ok(odds.winProbability < 1, "fantasy is never certain");
});

test("two identical lineups are a coin flip", () => {
  const odds = simulateMatchup(strong, strong, { iterations: 3000, seed: 5 });
  assert.ok(Math.abs(odds.winProbability - 0.5) < 0.05, `got ${odds.winProbability}`);
});

test("the same seed gives the same answer, so the page doesn't flicker", () => {
  const a = simulateMatchup(strong, weak, { iterations: 1000, seed: 99 });
  const b = simulateMatchup(strong, weak, { iterations: 1000, seed: 99 });
  assert.deepEqual(a, b);
});

test("a wider spread makes an underdog more live", () => {
  const volatile = Array.from({ length: 9 }, () => ({ projectedPoints: 10, floor: 0, ceiling: 24 }));
  const steady = simulateMatchup(strong, weak, { iterations: 3000, seed: 3 }).winProbability;
  const swingy = simulateMatchup(strong, volatile, { iterations: 3000, seed: 3 }).winProbability;
  assert.ok(
    swingy < steady,
    `a high-variance underdog should win more often: ${swingy} vs ${steady}`,
  );
});

test("median scores land near the projected totals", () => {
  const odds = simulateMatchup(strong, weak, { iterations: 3000, seed: 2 });
  assert.ok(Math.abs(odds.medianA - 135) < 8, `got ${odds.medianA}`);
  assert.ok(Math.abs(odds.medianB - 90) < 8, `got ${odds.medianB}`);
});

test("an empty lineup scores zero and always loses", () => {
  const odds = simulateMatchup([], weak, { iterations: 500, seed: 4 });
  assert.equal(odds.medianA, 0);
  assert.equal(odds.winProbability, 0);
});

// -- Playoff odds -------------------------------------------------------------

const REMAINING = [
  { week: 7, homeTeamId: "a", awayTeamId: "d" },
  { week: 7, homeTeamId: "b", awayTeamId: "c" },
  { week: 8, homeTeamId: "a", awayTeamId: "b" },
  { week: 8, homeTeamId: "c", awayTeamId: "d" },
];

test("odds are probabilities and the field is plausible", () => {
  const odds = playoffOdds({ teams: TEAMS, remaining: REMAINING, playoffSpots: 2, iterations: 500 });
  for (const value of Object.values(odds)) {
    assert.ok(value >= 0 && value <= 1, `out of range: ${value}`);
  }
  const total = Object.values(odds).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 2) < 0.05, `two spots should sum to ~2, got ${total}`);
});

test("the team with the best record and scoring is the likeliest to make it", () => {
  const odds = playoffOdds({ teams: TEAMS, remaining: REMAINING, playoffSpots: 2, iterations: 800 });
  assert.ok(odds.b > odds.d, "a 5-1 team should beat a 2-4 team's odds");
});

test("more playoff spots never lowers a team's odds", () => {
  const two = playoffOdds({ teams: TEAMS, remaining: REMAINING, playoffSpots: 2, iterations: 500 });
  const three = playoffOdds({ teams: TEAMS, remaining: REMAINING, playoffSpots: 3, iterations: 500 });
  for (const id of Object.keys(two)) {
    assert.ok(three[id] >= two[id] - 0.02, `${id}: ${three[id]} < ${two[id]}`);
  }
});

test("no remaining games means the current standings decide it", () => {
  const odds = playoffOdds({ teams: TEAMS, remaining: [], playoffSpots: 2, iterations: 100 });
  assert.equal(odds.b, 1, "the 5-1 team is already in");
});

console.log(`\n${passed} passing\n`);
