// Dependency-free checks on the lineup optimizer, value providers and the
// trade evaluator. Run: node --experimental-strip-types scripts/test-trade.mjs

import assert from "node:assert/strict";
import {
  optimizeLineup,
  lineupTotal,
  slotAccepts,
  evaluateTrade,
  verdictFor,
  adviseLineup,
  COIN_FLIP_THRESHOLD,
  rankAdditions,
  rankDrops,
  recommendFaabBid,
} from "../src/lib/core/trade/engine.ts";
import {
  pointsAboveReplacementProvider,
  createCsvValueProvider,
  normalizeName,
  DEFAULT_REPLACEMENT_LEVEL,
} from "../src/lib/core/trade/value.ts";

let passed = 0;
function test(name, fn) {
  const r = fn();
  const done = () => { passed++; console.log(`  ok  ${name}`); };
  return r instanceof Promise ? r.then(done) : done();
}

const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"].map((code, index) => ({ code, index }));
const p = (id, name, position, projectedPoints) => ({ playerId: id, name, position, projectedPoints });

console.log("\nLineup, value and trades\n");

await test("FLEX accepts RB, WR and TE but not QB", () => {
  assert.ok(slotAccepts("FLEX", "RB"));
  assert.ok(slotAccepts("FLEX", "TE"));
  assert.ok(!slotAccepts("FLEX", "QB"));
  assert.ok(slotAccepts("SUPER_FLEX", "QB"));
  assert.ok(slotAccepts("RB", "RB"));
  assert.ok(!slotAccepts("RB", "WR"));
});

await test("the optimizer does not strand a dedicated slot by filling FLEX first", () => {
  // The classic bug: greedy down the slot list puts the best RB in FLEX,
  // leaving RB2 empty. Exactly two RBs exist, and both dedicated RB slots
  // must be filled before FLEX gets one.
  const roster = [
    p("qb", "QB One", "QB", 20),
    p("rb1", "RB One", "RB", 18),
    p("rb2", "RB Two", "RB", 15),
    p("wr1", "WR One", "WR", 14),
    p("wr2", "WR Two", "WR", 12),
    p("wr3", "WR Three", "WR", 11),
    p("te1", "TE One", "TE", 9),
    p("k1", "K One", "K", 8),
    p("d1", "D One", "DEF", 7),
  ];
  const result = optimizeLineup(roster, SLOTS);
  const rbSlots = result.assignments.filter((a) => a.slot === "RB");
  assert.equal(rbSlots.length, 2);
  assert.ok(rbSlots.every((a) => a.player !== null), "both RB slots must be filled");
  const flex = result.assignments.find((a) => a.slot === "FLEX");
  assert.equal(flex.player.playerId, "wr3");
});

await test("lineup total counts starters only, and bench is the remainder", () => {
  const roster = [
    p("qb", "QB One", "QB", 20), p("rb1", "RB One", "RB", 18), p("rb2", "RB Two", "RB", 15),
    p("wr1", "WR One", "WR", 14), p("wr2", "WR Two", "WR", 12), p("te1", "TE One", "TE", 9),
    p("k1", "K One", "K", 8), p("d1", "D One", "DEF", 7),
    p("bench", "Bench Guy", "WR", 30),
  ];
  const result = optimizeLineup(roster, SLOTS);
  // The 30-point WR is too good to bench: he takes a WR slot, not the FLEX.
  assert.ok(result.assignments.some((a) => a.player?.playerId === "bench"));
  assert.equal(result.benched.length, roster.length - SLOTS.filter((s) => filled(result, s)).length);
  function filled(res, slot) {
    return res.assignments.find((a) => a.slotIndex === slot.index)?.player != null;
  }
});

await test("an empty roster produces empty slots rather than throwing", () => {
  const result = optimizeLineup([], SLOTS);
  assert.equal(result.total, 0);
  assert.ok(result.assignments.every((a) => a.player === null));
});

await test("value is points above replacement, scaled by weeks remaining", async () => {
  const ctx = { weeksRemaining: 10, isDynasty: false, replacementLevel: DEFAULT_REPLACEMENT_LEVEL };
  const [rb] = await pointsAboveReplacementProvider.getValues(
    [{ playerId: "a", name: "Good RB", position: "RB", projectedPointsPerGame: 16 }],
    ctx,
  );
  assert.equal(rb.value, 100); // (16 - 6) x 10 weeks

  const [late] = await pointsAboveReplacementProvider.getValues(
    [{ playerId: "a", name: "Good RB", position: "RB", projectedPointsPerGame: 16 }],
    { ...ctx, weeksRemaining: 3 },
  );
  assert.equal(late.value, 30); // same player, far less season left
});

await test("a replacement-level player is worth nothing, never negative", async () => {
  const ctx = { weeksRemaining: 10, isDynasty: false, replacementLevel: DEFAULT_REPLACEMENT_LEVEL };
  const [v] = await pointsAboveReplacementProvider.getValues(
    [{ playerId: "x", name: "Streamer", position: "WR", projectedPointsPerGame: 3 }],
    ctx,
  );
  assert.equal(v.value, 0);
});

await test("age discounts apply in dynasty and are ignored in redraft", async () => {
  const player = { playerId: "a", name: "Old RB", position: "RB", projectedPointsPerGame: 16, age: 31 };
  const base = { weeksRemaining: 10, replacementLevel: DEFAULT_REPLACEMENT_LEVEL };
  const [redraft] = await pointsAboveReplacementProvider.getValues([player], { ...base, isDynasty: false });
  const [dynasty] = await pointsAboveReplacementProvider.getValues([player], { ...base, isDynasty: true });
  assert.equal(redraft.value, 100);
  assert.ok(dynasty.value < redraft.value);
});

await test("imported value charts match names despite punctuation and suffixes", async () => {
  assert.equal(normalizeName("A.J. Brown Jr."), "aj brown");
  assert.equal(normalizeName("Ja'Marr Chase"), "jamarr chase");
  const provider = createCsvValueProvider({
    id: "chart", label: "Chart", rows: [{ name: "AJ Brown", value: 55 }],
  });
  const [v] = await provider.getValues(
    [{ playerId: "1", name: "A.J. Brown Jr.", position: "WR" }],
    { weeksRemaining: 10, isDynasty: false, replacementLevel: {} },
  );
  assert.equal(v.value, 55);
});

await test("a player unknown to the chart scores zero with zero confidence", async () => {
  const provider = createCsvValueProvider({ id: "chart", label: "Chart", rows: [] });
  const [v] = await provider.getValues(
    [{ playerId: "1", name: "Nobody", position: "WR" }],
    { weeksRemaining: 10, isDynasty: false, replacementLevel: {} },
  );
  assert.equal(v.value, 0);
  assert.equal(v.confidence, 0);
});

// -- Trade evaluation ---------------------------------------------------------

const rbHeavy = {
  teamId: "A", teamName: "RB Heavy",
  roster: [
    p("qb", "QB One", "QB", 18),
    p("rb1", "RB One", "RB", 19), p("rb2", "RB Two", "RB", 17),
    p("rb3", "RB Three", "RB", 16), p("rb4", "RB Four", "RB", 15),
    p("wr1", "WR One", "WR", 11), p("wr2", "WR Two", "WR", 7),
    p("te1", "TE One", "TE", 8), p("k1", "K One", "K", 8), p("d1", "D One", "DEF", 7),
  ],
  sending: ["rb4"],
};
const wrHeavy = {
  teamId: "B", teamName: "WR Heavy",
  roster: [
    p("bqb", "QB Two", "QB", 18),
    p("brb1", "RB Five", "RB", 10), p("brb2", "RB Six", "RB", 6),
    p("bwr1", "WR Three", "WR", 20), p("bwr2", "WR Four", "WR", 18),
    p("bwr3", "WR Five", "WR", 17), p("bwr4", "WR Six", "WR", 16),
    p("bte", "TE Two", "TE", 8), p("bk", "K Two", "K", 8), p("bd", "D Two", "DEF", 7),
  ],
  sending: ["bwr4"],
};

await test("a trade of surplus for need improves both rosters", () => {
  const result = evaluateTrade({ sideA: rbHeavy, sideB: wrHeavy, slots: SLOTS, weeksRemaining: 10 });
  assert.ok(result.sideA.weeklyDelta > 0, `A delta ${result.sideA.weeklyDelta}`);
  assert.ok(result.sideB.weeklyDelta > 0, `B delta ${result.sideB.weeklyDelta}`);
  assert.equal(result.mutuallyBeneficial, true);
});

await test("a fourth good RB adds nothing to a team already starting three", () => {
  // RB Heavy already starts RB1, RB2 and RB3 (in FLEX). Sending away the
  // fourth costs its lineup exactly nothing.
  const before = lineupTotal(rbHeavy.roster, SLOTS);
  const after = lineupTotal(rbHeavy.roster.filter((x) => x.playerId !== "rb4"), SLOTS);
  assert.equal(before, after);
});

await test("the same trade is scored separately for each side", () => {
  // A sends a WR who is already the weak link in their lineup and receives
  // B's best WR. B gets back a player who doesn't crack their lineup, so the
  // deal helps A and hurts B, the engine must not report one number for both.
  const lopsided = evaluateTrade({
    sideA: { ...rbHeavy, sending: ["wr2"] },
    sideB: { ...wrHeavy, sending: ["bwr1"] },
    slots: SLOTS,
    weeksRemaining: 10,
  });
  assert.ok(lopsided.sideA.weeklyDelta > 0);
  assert.ok(lopsided.sideB.weeklyDelta < 0);
  assert.equal(lopsided.mutuallyBeneficial, false);
  assert.match(lopsided.reasoning.join(" "), /little reason to accept/i);
});

await test("giving up surplus at a position of strength can still help the other side", () => {
  // The counterintuitive case, and the reason the engine works per-roster:
  // a WR-heavy team trading its best WR for a good RB IMPROVES, because the
  // RB replaces a 6-point starter while a bench WR slides up.
  const r = evaluateTrade({
    sideA: { ...rbHeavy, sending: ["rb4"] },
    sideB: { ...wrHeavy, sending: ["bwr1"] },
    slots: SLOTS,
    weeksRemaining: 10,
  });
  assert.ok(r.sideB.weeklyDelta > 0, `expected B to gain, got ${r.sideB.weeklyDelta}`);
  assert.equal(r.mutuallyBeneficial, true);
});

await test("season delta scales the weekly gain by weeks remaining", () => {
  const r = evaluateTrade({ sideA: rbHeavy, sideB: wrHeavy, slots: SLOTS, weeksRemaining: 8 });
  assert.equal(r.sideA.seasonDelta, Math.round(r.sideA.weeklyDelta * 8 * 100) / 100);
});

await test("verdict thresholds treat sub-point swings as noise", () => {
  assert.equal(verdictFor(5), "accept");
  assert.equal(verdictFor(1.5), "lean_accept");
  assert.equal(verdictFor(0.2), "fair");
  assert.equal(verdictFor(-0.2), "fair");
  assert.equal(verdictFor(-1.5), "lean_decline");
  assert.equal(verdictFor(-5), "decline");
});

await test("a one-sided giveaway is flagged, not scored as a great trade", () => {
  const r = evaluateTrade({
    sideA: { ...rbHeavy, sending: [] },
    sideB: { ...wrHeavy, sending: ["bwr4"] },
    slots: SLOTS,
    weeksRemaining: 10,
  });
  assert.match(r.warnings.join(" "), /giveaway/i);
});

await test("players the sender doesn't roster are ignored with a warning", () => {
  const r = evaluateTrade({
    sideA: { ...rbHeavy, sending: ["not-on-roster"] },
    sideB: wrHeavy,
    slots: SLOTS,
  });
  assert.match(r.warnings.join(" "), /doesn't roster/i);
});

// -- Start/sit advice ---------------------------------------------------------

const startSitRoster = [
  p("qb", "QB One", "QB", 20),
  p("rb1", "RB One", "RB", 18), p("rb2", "RB Two", "RB", 15),
  p("wr1", "WR One", "WR", 14), p("wr2", "WR Two", "WR", 6),
  p("te1", "TE One", "TE", 9), p("k1", "K One", "K", 8), p("d1", "D One", "DEF", 7),
  p("flexguy", "Flex Guy", "RB", 12),
  p("benchwr", "Bench WR", "WR", 13),
];
const CURRENT = ["qb", "rb1", "rb2", "wr1", "wr2", "te1", "flexguy", "k1", "d1"];

await test("a clearly better bench player is recommended, with the gain", () => {
  const advice = adviseLineup({ roster: startSitRoster, currentStarterIds: CURRENT, slots: SLOTS });
  assert.ok(advice.pointsGained > 0, `expected a gain, got ${advice.pointsGained}`);
  const change = advice.changes.find((c) => c.in.playerId === "benchwr");
  assert.ok(change, "Bench WR (13) should replace WR Two (6)");
  assert.equal(change.out.playerId, "wr2");
  assert.equal(change.gain, 7);
  assert.equal(change.isCoinFlip, false);
});

await test("an already-optimal lineup recommends nothing", () => {
  const advice = adviseLineup({
    roster: startSitRoster,
    currentStarterIds: ["qb", "rb1", "rb2", "wr1", "benchwr", "te1", "flexguy", "k1", "d1"],
    slots: SLOTS,
  });
  assert.equal(advice.changes.length, 0);
  assert.equal(advice.pointsGained, 0);
});

await test("a sub-1.5-point gap is labelled a coin flip, not a recommendation", () => {
  const roster = [
    p("qb", "QB One", "QB", 20), p("rb1", "RB One", "RB", 18), p("rb2", "RB Two", "RB", 15),
    p("wr1", "WR One", "WR", 14), p("wr2", "WR Two", "WR", 12.0),
    p("te1", "TE One", "TE", 9), p("k1", "K One", "K", 8), p("d1", "D One", "DEF", 7),
    p("flexguy", "Flex Guy", "RB", 11),
    p("close", "Close Call", "WR", 12.9),
  ];
  const advice = adviseLineup({
    roster,
    currentStarterIds: ["qb", "rb1", "rb2", "wr1", "wr2", "te1", "flexguy", "k1", "d1"],
    slots: SLOTS,
  });
  const change = advice.changes.find((c) => c.in.playerId === "close");
  assert.ok(change);
  assert.ok(Math.abs(change.gain) < COIN_FLIP_THRESHOLD);
  assert.equal(change.isCoinFlip, true);
  assert.match(change.reason, /coin flip/i);
});

await test("a bye-week starter is a critical alert and is never left in the lineup", () => {
  const roster = startSitRoster.map((x) =>
    x.playerId === "wr1" ? { ...x, isOnBye: true } : x,
  );
  const advice = adviseLineup({ roster, currentStarterIds: CURRENT, slots: SLOTS });
  assert.ok(advice.alerts.some((a) => a.severity === "critical" && /bye/i.test(a.message)));
  const starters = advice.optimal.assignments.map((a) => a.player?.playerId);
  assert.ok(!starters.includes("wr1"), "a bye-week player must not be in the optimal lineup");
});

await test("an Out player is excluded from the optimizer, not merely flagged", () => {
  const roster = startSitRoster.map((x) =>
    x.playerId === "rb1" ? { ...x, injuryStatus: "Out" } : x,
  );
  const advice = adviseLineup({ roster, currentStarterIds: CURRENT, slots: SLOTS });
  assert.ok(advice.alerts.some((a) => a.severity === "critical" && /Out/.test(a.message)));
  const starters = advice.optimal.assignments.map((a) => a.player?.playerId);
  assert.ok(!starters.includes("rb1"));
});

await test("Questionable is a warning, and the player can still start", () => {
  const roster = startSitRoster.map((x) =>
    x.playerId === "rb1" ? { ...x, injuryStatus: "Questionable" } : x,
  );
  const advice = adviseLineup({ roster, currentStarterIds: CURRENT, slots: SLOTS });
  assert.ok(advice.alerts.some((a) => a.severity === "warning" && /Questionable/.test(a.message)));
  const starters = advice.optimal.assignments.map((a) => a.player?.playerId);
  assert.ok(starters.includes("rb1"), "Questionable players are still eligible");
});

await test("empty starting slots are reported as critical", () => {
  const advice = adviseLineup({
    roster: startSitRoster,
    currentStarterIds: ["qb", "rb1", "rb2"],
    slots: SLOTS,
  });
  assert.ok(advice.alerts.some((a) => a.severity === "critical" && /empty/i.test(a.message)));
});

await test("a missing projection is surfaced rather than treated as zero points", () => {
  const roster = startSitRoster.map((x) =>
    x.playerId === "k1" ? { ...x, hasProjection: false } : x,
  );
  const advice = adviseLineup({ roster, currentStarterIds: CURRENT, slots: SLOTS });
  assert.ok(advice.alerts.some((a) => /No projection/i.test(a.message)));
});

// -- Waivers ------------------------------------------------------------------

const thinAtWr = [
  p("qb", "QB One", "QB", 20),
  p("rb1", "RB One", "RB", 18), p("rb2", "RB Two", "RB", 15),
  p("wr1", "WR One", "WR", 13), p("wr2", "WR Two", "WR", 5),
  p("te1", "TE One", "TE", 9), p("k1", "K One", "K", 8), p("d1", "D One", "DEF", 7),
  p("flex", "Flex Guy", "RB", 11),
];

await test("free agents are ranked by lineup gain, not raw projection", () => {
  const ranked = rankAdditions(thinAtWr, SLOTS, [
    p("fa-wr", "Free WR", "WR", 11),   // replaces the 5-point WR2: +6
    p("fa-rb", "Free RB", "RB", 12),   // can't crack an RB room of 18/15/11: +1
  ]);
  assert.equal(ranked[0].player.playerId, "fa-wr");
  assert.equal(ranked[0].lineupGain, 6);
  assert.ok(
    ranked[0].lineupGain > ranked[1].lineupGain,
    "the lower-projected WR must outrank the higher-projected RB for THIS roster",
  );
});

await test("a free agent who can't crack the lineup is worth zero, not his projection", () => {
  const [ranked] = rankAdditions(thinAtWr, SLOTS, [p("scrub", "Bench Fodder", "RB", 9)]);
  assert.equal(ranked.lineupGain, 0);
  assert.equal(ranked.cracksLineup, false);
});

await test("an addition reports who it displaces", () => {
  const [ranked] = rankAdditions(thinAtWr, SLOTS, [p("fa-wr", "Free WR", "WR", 11)]);
  assert.equal(ranked.cracksLineup, true);
  assert.equal(ranked.displaces.playerId, "wr2");
});

await test("drop candidates are ranked by what the lineup loses, not by projection", () => {
  const drops = rankDrops(thinAtWr, SLOTS);
  // Cheapest to lose is the 5-point WR. Dearest is the QB, not the highest
  // projected player, but the one with no replacement behind him, which is
  // exactly the distinction raw projections miss.
  assert.equal(drops[0].player.playerId, "wr2");
  assert.equal(drops[0].lineupCost, 5);
  assert.equal(drops[drops.length - 1].player.playerId, "qb");
  assert.equal(drops[drops.length - 1].lineupCost, 20);

  const rb1 = drops.find((d) => d.player.playerId === "rb1");
  assert.equal(rb1.lineupCost, 18, "an 18-point RB with depth behind him costs less than the QB");
});

await test("protected players sort last and are flagged, never hidden", () => {
  const drops = rankDrops(thinAtWr, SLOTS, ["wr2"]);
  const wr2 = drops.find((d) => d.player.playerId === "wr2");
  assert.equal(wr2.isProtected, true);
  assert.ok(drops.indexOf(wr2) > 0, "a protected player must not be the top drop suggestion");
  assert.equal(drops.length, thinAtWr.length, "protected players stay in the list");
});

// -- FAAB ---------------------------------------------------------------------

await test("a bigger lineup gain earns a bigger bid", () => {
  const small = recommendFaabBid({ lineupGain: 2, budgetRemaining: 100, weeksRemaining: 12 });
  const big = recommendFaabBid({ lineupGain: 8, budgetRemaining: 100, weeksRemaining: 12 });
  assert.ok(big.bid > small.bid, `${big.bid} should exceed ${small.bid}`);
  assert.ok(big.bid <= 100);
});

await test("the same gain is worth less late in the season", () => {
  const early = recommendFaabBid({ lineupGain: 6, budgetRemaining: 100, weeksRemaining: 12 });
  const late = recommendFaabBid({ lineupGain: 6, budgetRemaining: 100, weeksRemaining: 3 });
  assert.ok(late.bid < early.bid, `${late.bid} should be under ${early.bid}`);
  assert.match(late.reasoning.join(" "), /weeks left/i);
});

await test("a broke league means a cheaper winning bid", () => {
  const rich = recommendFaabBid({ lineupGain: 6, budgetRemaining: 100, weeksRemaining: 12, leagueAverageRemaining: 90 });
  const broke = recommendFaabBid({ lineupGain: 6, budgetRemaining: 100, weeksRemaining: 12, leagueAverageRemaining: 10 });
  assert.ok(broke.bid < rich.bid);
  assert.match(broke.reasoning.join(" "), /cheaper/i);
});

await test("a noise-level gain is a minimum bid, not a real one", () => {
  const advice = recommendFaabBid({ lineupGain: 0.4, budgetRemaining: 100, weeksRemaining: 12 });
  assert.equal(advice.worthTheClaim, false);
  assert.equal(advice.bid, 1);
  assert.match(advice.reasoning.join(" "), /minimum or pass/i);
});

await test("a rolling-priority league gets a yes/no, never a dollar figure", () => {
  const advice = recommendFaabBid({ lineupGain: 6, budgetRemaining: null, weeksRemaining: 12 });
  assert.equal(advice.bid, null);
  assert.equal(advice.percentOfRemaining, null);
  assert.equal(advice.worthTheClaim, true);
  assert.match(advice.reasoning.join(" "), /waiver claim/i);
});

await test("an exhausted budget is reported rather than producing a bid of 1", () => {
  const advice = recommendFaabBid({ lineupGain: 6, budgetRemaining: 0, weeksRemaining: 12 });
  assert.equal(advice.bid, 0);
  assert.match(advice.reasoning.join(" "), /No FAAB budget left/i);
});

console.log(`\n${passed} passing\n`);
