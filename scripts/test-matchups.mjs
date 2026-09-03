// Defensive strength and schedule lookups.
// Run: node --experimental-strip-types scripts/test-matchups.mjs
import assert from "node:assert/strict";
import { pointsAllowedByDefense, upcomingOpponents } from "../src/lib/core/matchups.ts";

let passed = 0;
const test = (n, fn) => { fn(); passed++; console.log(`  ok  ${n}`); };

console.log("\nMatchups\n");

const rows = [
  // BAD gives up a lot to WRs across two weeks; GOOD gives up little.
  { opponentTeam: "BAD", position: "WR", points: 20, week: 1 },
  { opponentTeam: "BAD", position: "WR", points: 16, week: 1 },
  { opponentTeam: "BAD", position: "WR", points: 22, week: 2 },
  { opponentTeam: "BAD", position: "WR", points: 14, week: 2 },
  { opponentTeam: "GOOD", position: "WR", points: 4, week: 1 },
  { opponentTeam: "GOOD", position: "WR", points: 6, week: 1 },
  { opponentTeam: "GOOD", position: "WR", points: 5, week: 2 },
  { opponentTeam: "GOOD", position: "WR", points: 3, week: 2 },
];

test("a generous defense scores above 1 and a stingy one below", () => {
  const table = pointsAllowedByDefense(rows);
  assert.ok(table.BAD.WR.multiplier > 1, `BAD was ${table.BAD.WR.multiplier}`);
  assert.ok(table.GOOD.WR.multiplier < 1, `GOOD was ${table.GOOD.WR.multiplier}`);
  assert.ok(table.BAD.WR.pointsAllowed > table.GOOD.WR.pointsAllowed);
});

test("points are averaged per game, not per player row", () => {
  const table = pointsAllowedByDefense(rows);
  assert.equal(table.BAD.WR.games, 2);
  assert.equal(table.BAD.WR.pointsAllowed, 36); // (20+16+22+14) / 2 games
});

test("positions are scored independently", () => {
  const mixed = [...rows, { opponentTeam: "BAD", position: "TE", points: 2, week: 1 }];
  const table = pointsAllowedByDefense(mixed);
  assert.ok(table.BAD.TE);
  assert.notEqual(table.BAD.TE.multiplier, table.BAD.WR.multiplier);
});

test("empty input produces an empty table rather than throwing", () => {
  assert.deepEqual(pointsAllowedByDefense([]), {});
});

const schedule = [
  { season: "2026", week: 5, homeTeam: "AAA", awayTeam: "BBB" },
  { season: "2026", week: 6, homeTeam: "CCC", awayTeam: "AAA" },
  // AAA is on bye in week 7
  { season: "2026", week: 8, homeTeam: "AAA", awayTeam: "DDD" },
];

test("upcoming opponents come back in order, with home/away", () => {
  const next = upcomingOpponents(schedule, "AAA", 5, 2);
  assert.deepEqual(next, [
    { week: 5, opponent: "BBB", isHome: true },
    { week: 6, opponent: "CCC", isHome: false },
  ]);
});

test("a bye shows as a null opponent, since that's the week a stream breaks", () => {
  const next = upcomingOpponents(schedule, "AAA", 5, 3);
  assert.equal(next[2].week, 7);
  assert.equal(next[2].opponent, null);
});

test("an unknown team yields byes rather than throwing", () => {
  const next = upcomingOpponents(schedule, "ZZZ", 5, 2);
  assert.equal(next.length, 2);
  assert.ok(next.every((n) => n.opponent === null));
});

console.log(`\n${passed} passing\n`);
