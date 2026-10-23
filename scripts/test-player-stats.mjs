import assert from "node:assert/strict";
import { summarizePlayerStats } from "../src/lib/core/playerStats.ts";

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

console.log("\nPlayer stat summaries\n");

test("season totals and latest game remain tied to the player", () => {
  const summary = summarizePlayerStats("WR", [
    game(3, 18.4, { targets: 9, receptions: 6, receiving_yards: 94, receiving_tds: 1 }),
    game(1, 10, { targets: 7, receptions: 5, receiving_yards: 50 }),
  ]);

  assert.equal(summary.gamesPlayed, 2);
  assert.equal(summary.seasonPoints, 28.4);
  assert.equal(summary.pointsPerGame, 14.2);
  assert.equal(summary.latestWeek, 3);
  assert.equal(summary.latestPoints, 18.4);
  assert.equal(summary.totals.find((stat) => stat.key === "targets").value, 16);
  assert.equal(summary.totals.find((stat) => stat.key === "receiving_yards").value, 144);
});

test("quarterbacks expose passing and rushing production", () => {
  const summary = summarizePlayerStats("QB", [
    game(1, 22.5, { attempts: 35, completions: 24, passing_yards: 280, passing_tds: 2, carries: 4, rushing_yards: 20 }),
  ]);
  assert.equal(summary.totals.find((stat) => stat.key === "passing_yards").value, 280);
  assert.equal(summary.totals.find((stat) => stat.key === "rushing_yards").value, 20);
});

test("a player without stored games has no invented summary", () => {
  assert.equal(summarizePlayerStats("RB", []), null);
});

console.log(`\n${passed} passing\n`);

function game(week, fantasyPoints, stats) {
  return { week, fantasyPoints, stats };
}
