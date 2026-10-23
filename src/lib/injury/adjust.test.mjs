import assert from "node:assert/strict";
import { injuryAdjustedProjection } from "./adjust.ts";
import { QUESTIONABLE_PLAY_RATE } from "./risk.ts";

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

console.log("\nInjury projection adjustment\n");

test("a non-knee injury is driven by its questionable designation", () => {
  const result = injuryAdjustedProjection(20, "hamstring strain", "questionable", null);
  assert.equal(result.availability, QUESTIONABLE_PLAY_RATE);
  assert.equal(result.adjustedProjection, 12.8);
  assert.equal(result.benchFlag, false);
});

test("an out designation zeroes the expected projection", () => {
  const result = injuryAdjustedProjection(20, "hamstring strain", "out", null);
  assert.equal(result.availability, 0);
  assert.equal(result.adjustedProjection, 0);
  assert.equal(result.benchFlag, true);
});

test("non-knee text without a designation leaves the projection unchanged", () => {
  const result = injuryAdjustedProjection(20, "hamstring strain", null, null);
  assert.equal(result.adjustedProjection, 20);
  assert.equal(result.availability, 1);
});

console.log(`\n${passed} passing\n`);
