// Dependency-free checks on scoring and the projection model.
// Run: node --experimental-strip-types scripts/test-projections.mjs

import assert from "node:assert/strict";
import { scoreStatLine } from "../src/lib/projections/scoring.ts";
import { clamp, computeConfidence, project, quantile } from "../src/lib/projections/model.ts";

/** Helper: score a stat line, then shape it as a GameLine for the model. */
const game = (week, stats, opportunity, scoring) => ({
  week,
  points: scoreStatLine(stats, scoring, "WR").points,
  opportunity,
});

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// Ja'Marr Chase, 2024 week 5 — real nflverse row.
const CHASE_W5 = {
  receptions: 10,
  targets: 12,
  receiving_yards: 193,
  receiving_tds: 2,
  rushing_yards: 0,
  carries: 0,
};

const PPR = { rec: 1, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1, rush_td: 6, pass_td: 4, pass_yd: 0.04 };
const HALF_PPR = { ...PPR, rec: 0.5 };
const STANDARD = { ...PPR, rec: 0 };

console.log("\nScoring and projections\n");

test("the model never sees a stat line, only points", () => {
  // Decoupling check: project() takes pre-scored games, so it cannot assume a
  // scoring format. Same points in, same projection out, whatever the league.
  const a = project({ games: [{ week: 1, points: 20, opportunity: 10 }] });
  const b = project({ games: [{ week: 1, points: 20, opportunity: 10 }] });
  assert.equal(a.projectedPoints, b.projectedPoints);
});

test("scores a real stat line correctly in full PPR", () => {
  // 10 rec + 19.3 yds + 12 TD = 41.3 — matches nflverse's own fantasy_points_ppr.
  assert.equal(scoreStatLine(CHASE_W5, PPR, "WR").points, 41.3);
});

test("the same line scores differently in half-PPR and standard", () => {
  assert.equal(scoreStatLine(CHASE_W5, HALF_PPR, "WR").points, 36.3);
  assert.equal(scoreStatLine(CHASE_W5, STANDARD, "WR").points, 31.3);
});

test("TE premium applies only to tight ends", () => {
  const tePremium = { ...PPR, bonus_rec_te: 0.5 };
  const asTe = scoreStatLine(CHASE_W5, tePremium, "TE").points;
  const asWr = scoreStatLine(CHASE_W5, tePremium, "WR").points;
  assert.equal(asTe - asWr, 5); // 10 receptions x 0.5
});

test("fumbles lost sum across all three nflverse columns", () => {
  const line = { rushing_fumbles_lost: 1, receiving_fumbles_lost: 1, sack_fumbles_lost: 1 };
  assert.equal(scoreStatLine(line, { fum_lost: -2 }).points, -6);
});

test("missing and null stats count as zero, never NaN", () => {
  const result = scoreStatLine({ receptions: null, receiving_yards: undefined }, PPR, "WR");
  assert.equal(result.points, 0);
  assert.ok(Number.isFinite(result.points));
});

test("scoring rules it cannot compute are reported, not silently dropped", () => {
  const withDst = { ...PPR, def_st_td: 6, pts_allow_0: 10 };
  const { unsupportedKeys } = scoreStatLine(CHASE_W5, withDst, "WR");
  assert.deepEqual(unsupportedKeys.sort(), ["def_st_td", "pts_allow_0"]);
});

test("a bye week projects zero with a reason, not a low number", () => {
  const p = project({ games: [], isByeWeek: true });
  assert.equal(p.projectedPoints, 0);
  assert.match(p.reasoning.join(" "), /bye/i);
});

test("an Out player projects zero even with strong recent games", () => {
  const games = [1, 2, 3, 4].map((w) => game(w, CHASE_W5, 12, PPR));
  const p = project({ games, injuryStatus: "Out" });
  assert.equal(p.projectedPoints, 0);
});

test("Questionable takes a haircut and lowers confidence", () => {
  const games = [1, 2, 3, 4].map((w) => game(w, CHASE_W5, 12, PPR));
  const healthy = project({ games });
  const questionable = project({ games, injuryStatus: "Questionable" });
  assert.ok(questionable.projectedPoints < healthy.projectedPoints);
  assert.ok(questionable.confidence < healthy.confidence);
});

test("recent games are weighted more heavily than older ones", () => {
  // Same four games, reversed order. The player whose big games are most
  // recent must project higher — that is the whole point of recency weighting.
  const g = (pts, opp) => ({ points: pts, opportunity: opp, week: 0 });
  const trendingUp = project({ games: [g(25, 12), g(20, 10), g(6, 4), g(4, 3)] });
  const trendingDown = project({ games: [g(4, 3), g(6, 4), g(20, 10), g(25, 12)] });
  assert.ok(
    trendingUp.projectedPoints > trendingDown.projectedPoints,
    `expected ${trendingUp.projectedPoints} > ${trendingDown.projectedPoints}`,
  );
});

test("the matchup adjustment is capped at 15% either way", () => {
  const games = [1, 2, 3, 4].map((w) => game(w, CHASE_W5, 12, PPR));
  const neutral = project({ games });
  const absurd = project({ games, matchupMultiplier: 5 });
  assert.ok(absurd.projectedPoints <= neutral.projectedPoints * 1.151);
});

test("no history falls back to replacement level with low confidence", () => {
  const p = project({ games: [], replacementLevel: 7 });
  assert.equal(p.projectedPoints, 7);
  assert.ok(p.confidence <= 0.2);
});

test("a steady role scores higher confidence than an erratic one", () => {
  const steady = computeConfidence({ gameCount: 4, opportunities: [10, 10, 11, 9], questionable: false });
  const erratic = computeConfidence({ gameCount: 4, opportunities: [1, 18, 2, 15], questionable: false });
  assert.ok(steady > erratic);
  assert.ok(steady <= 0.95 && erratic >= 0.05);
});

test("floor never goes below zero and ceiling never below floor", () => {
  const games = [
    game(3, { receptions: 1, receiving_yards: 4 }, 2, PPR),
    game(2, { receptions: 0, receiving_yards: 0 }, 1, PPR),
  ];
  const p = project({ games });
  assert.ok(p.floor >= 0);
  assert.ok(p.ceiling >= p.floor);
});

test("quantile and clamp behave at the edges", () => {
  assert.equal(quantile([1, 2, 3, 4], 0), 1);
  assert.equal(quantile([1, 2, 3, 4], 1), 4);
  assert.equal(quantile([], 0.5), 0);
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
});

console.log(`\n${passed} passing\n`);
