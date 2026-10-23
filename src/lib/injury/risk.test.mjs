import assert from "node:assert/strict";
import { classify } from "./classify.ts";
import { assess, QUESTIONABLE_PLAY_RATE } from "./risk.ts";

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

console.log("\nInjury risk\n");

test("ACL is unavailable and season ending", () => {
  const injury = classify("torn ACL");
  assert.equal(injury.applies, true);
  const result = assess(injury, "questionable", null);
  assert.equal(result.availability, 0);
  assert.equal(result.label, "out");
  assert.equal(result.seasonEnding, true);
});

test("MCL with a questionable designation uses the calibrated play rate", () => {
  const injury = classify("MCL sprain");
  assert.equal(injury.applies, true);
  const result = assess(injury, "questionable", null);
  assert.equal(result.availability, QUESTIONABLE_PLAY_RATE);
  assert.equal(result.availability, 0.64);
  assert.equal(result.seasonEnding, false);
});

console.log(`\n${passed} passing\n`);
