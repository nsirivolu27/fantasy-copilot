// League-format derivation: slot counts, replacement level, streamable
// positions, format description.
// Run: node --experimental-strip-types scripts/test-format.mjs

import assert from "node:assert/strict";
import {
  positionStartCounts,
  deriveReplacementLevels,
  streamablePositions,
  describeLeagueFormat,
} from "../src/lib/core/trade/engine.ts";

let passed = 0;
const test = (n, fn) => { fn(); passed++; console.log(`  ok  ${n}`); };

const slots = (codes) => codes.map((code, index) => ({ code, index }));

const STANDARD = slots(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"]);
const SUPERFLEX = slots(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "K", "DEF"]);
const TWO_QB = slots(["QB", "QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"]);
const TWO_FLEX = slots(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DEF"]);

console.log("\nLeague format\n");

test("a flex slot is shared between the positions eligible for it", () => {
  const { dedicated, effective } = positionStartCounts(STANDARD);
  assert.equal(dedicated.RB, 2);
  assert.equal(dedicated.FLEX, undefined, "a flex is not dedicated to anything");
  // FLEX splits three ways: RB gets 2 + 1/3.
  assert.ok(Math.abs(effective.RB - 2.3333) < 0.001, `got ${effective.RB}`);
  assert.ok(Math.abs(effective.TE - 1.3333) < 0.001, `got ${effective.TE}`);
  assert.equal(effective.QB, 1);
});

test("superflex raises the effective QB requirement", () => {
  assert.equal(positionStartCounts(STANDARD).effective.QB, 1);
  assert.ok(positionStartCounts(SUPERFLEX).effective.QB > 1.2, "superflex must make QBs scarcer");
});

test("two flex slots deepen RB and WR requirements", () => {
  const one = positionStartCounts(STANDARD).effective.WR;
  const two = positionStartCounts(TWO_FLEX).effective.WR;
  assert.ok(two > one, `${two} should exceed ${one}`);
});

// -- Replacement level --------------------------------------------------------

/** 40 players per position, descending from 30 points in 0.5 steps. */
const pool = ["QB", "RB", "WR", "TE"].flatMap((position) =>
  Array.from({ length: 40 }, (_, i) => ({ position, projectedPoints: 30 - i * 0.5 })),
);

test("replacement level is the best player who can't start league-wide", () => {
  const levels = deriveReplacementLevels(pool, STANDARD, 12);
  // 12 teams x 1 QB = 12 starters, so the 13th QB is replacement: 30 - 12*0.5.
  assert.equal(levels.QB, 24);
});

test("more teams means a better replacement player and thinner value", () => {
  const ten = deriveReplacementLevels(pool, STANDARD, 10).RB;
  const fourteen = deriveReplacementLevels(pool, STANDARD, 14).RB;
  assert.ok(fourteen < ten, `a 14-team league must have a worse replacement RB: ${fourteen} vs ${ten}`);
});

test("superflex makes replacement QBs far better, which is the point", () => {
  const standard = deriveReplacementLevels(pool, STANDARD, 12).QB;
  const superflex = deriveReplacementLevels(pool, SUPERFLEX, 12).QB;
  assert.ok(
    superflex < standard,
    `superflex should push replacement deeper down the QB list: ${superflex} vs ${standard}`,
  );
});

test("a 2QB league is treated like a 2QB league, not a 1QB one", () => {
  const one = deriveReplacementLevels(pool, STANDARD, 12).QB;
  const two = deriveReplacementLevels(pool, TWO_QB, 12).QB;
  assert.ok(two < one, `${two} should be below ${one}`);
});

test("a position with no players falls back rather than producing NaN", () => {
  const levels = deriveReplacementLevels([], STANDARD, 12, { QB: 12, RB: 6 });
  assert.equal(levels.QB, 12);
  assert.equal(levels.RB, 6);
  assert.ok(!Number.isNaN(levels.QB));
});

test("a shallow pool clamps to the worst available player", () => {
  const thin = [
    { position: "TE", projectedPoints: 10 },
    { position: "TE", projectedPoints: 4 },
  ];
  const levels = deriveReplacementLevels(thin, STANDARD, 12);
  assert.equal(levels.TE, 4, "with only two TEs, the worst is replacement");
});

test("rostered positions the league doesn't start still get a value", () => {
  const withIdp = [...pool, { position: "LB", projectedPoints: 9 }];
  const levels = deriveReplacementLevels(withIdp, STANDARD, 12);
  assert.ok(levels.LB != null, "an IDP in a league with no IDP slot still needs a number");
});

// -- Streamable positions -----------------------------------------------------

test("single-slot positions are streamable, multi-slot ones aren't", () => {
  const streamable = streamablePositions(STANDARD);
  assert.deepEqual(streamable, ["DEF", "K", "QB", "TE"]);
  assert.ok(!streamable.includes("RB"));
  assert.ok(!streamable.includes("WR"));
});

test("superflex removes QB from the streamable list", () => {
  assert.ok(
    !streamablePositions(SUPERFLEX).includes("QB"),
    "nobody streams a QB in a league where everyone rosters two",
  );
  assert.ok(streamablePositions(SUPERFLEX).includes("TE"));
});

test("a 2QB league also removes QB", () => {
  assert.ok(!streamablePositions(TWO_QB).includes("QB"));
});

// -- Description --------------------------------------------------------------

test("the format description names what actually matters", () => {
  const text = describeLeagueFormat({
    teamCount: 12,
    slots: STANDARD,
    scoringSettings: { rec: 1 },
  });
  assert.match(text, /12-team/);
  assert.match(text, /PPR/);
  assert.match(text, /1QB/);
});

test("half-PPR, superflex, dynasty and TE premium are all detected", () => {
  const text = describeLeagueFormat({
    teamCount: 10,
    slots: SUPERFLEX,
    scoringSettings: { rec: 0.5, bonus_rec_te: 0.5 },
    isDynasty: true,
  });
  assert.match(text, /10-team/);
  assert.match(text, /0\.5-PPR/);
  assert.match(text, /superflex/);
  assert.match(text, /dynasty/);
  assert.match(text, /TE premium/);
});

test("standard scoring is called standard, not PPR", () => {
  const text = describeLeagueFormat({ teamCount: 12, slots: STANDARD, scoringSettings: {} });
  assert.match(text, /standard/);
  assert.ok(!/[^-]PPR/.test(text));
});

console.log(`\n${passed} passing\n`);
