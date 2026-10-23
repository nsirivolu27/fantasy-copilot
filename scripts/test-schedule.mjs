// Bye-week derivation. Run: node --experimental-strip-types scripts/test-schedule.mjs
import assert from "node:assert/strict";
import { deriveByeWeeks } from "../src/lib/core/schedule.ts";

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

/** Four teams, three weeks: each week one pair sits. */
const games = [
  { season: "2026", week: 1, gameType: "REG", awayTeam: "AAA", homeTeam: "BBB" },
  { season: "2026", week: 1, gameType: "REG", awayTeam: "CCC", homeTeam: "DDD" },
  { season: "2026", week: 2, gameType: "REG", awayTeam: "AAA", homeTeam: "CCC" },
  { season: "2026", week: 3, gameType: "REG", awayTeam: "BBB", homeTeam: "DDD" },
];

console.log("\nBye weeks\n");

test("a team's bye is the regular-season week it doesn't appear", () => {
  const { byeByTeam } = deriveByeWeeks(games, "2026");
  assert.equal(byeByTeam.AAA, 3);
  assert.equal(byeByTeam.BBB, 2);
  assert.equal(byeByTeam.CCC, 3);
  assert.equal(byeByTeam.DDD, 2);
});

test("postseason games are ignored", () => {
  const withPlayoffs = [
    ...games,
    { season: "2026", week: 4, gameType: "POST", awayTeam: "AAA", homeTeam: "BBB" },
  ];
  assert.deepEqual(deriveByeWeeks(withPlayoffs, "2026").weeksCovered, [1, 2, 3]);
});

test("other seasons are ignored", () => {
  const mixed = [
    ...games,
    { season: "2025", week: 9, gameType: "REG", awayTeam: "AAA", homeTeam: "DDD" },
  ];
  assert.equal(deriveByeWeeks(mixed, "2026").byeByTeam.AAA, 3);
});

test("a team with two off weeks is reported as an anomaly, not guessed", () => {
  const partial = [
    { season: "2026", week: 1, gameType: "REG", awayTeam: "AAA", homeTeam: "BBB" },
    { season: "2026", week: 2, gameType: "REG", awayTeam: "CCC", homeTeam: "DDD" },
    { season: "2026", week: 3, gameType: "REG", awayTeam: "CCC", homeTeam: "DDD" },
  ];
  const { byeByTeam, anomalies } = deriveByeWeeks(partial, "2026");
  assert.equal(byeByTeam.AAA, undefined);
  assert.ok(anomalies.some((a) => a.team === "AAA" && a.weeks.length === 2));
});

test("an empty schedule produces no byes rather than throwing", () => {
  const result = deriveByeWeeks([], "2026");
  assert.deepEqual(result.byeByTeam, {});
  assert.deepEqual(result.weeksCovered, []);
});

console.log(`\n${passed} passing\n`);
