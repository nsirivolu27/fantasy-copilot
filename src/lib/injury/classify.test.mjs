import assert from "node:assert/strict";
import { classify, getKneeInjuryCategories } from "./classify.ts";

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

console.log("\nInjury classifier\n");

test("the map contains the ten specified categories", () => {
  assert.deepEqual(
    getKneeInjuryCategories().map((category) => category.id),
    [
      "acl_tear",
      "patellar_tendon_rupture",
      "pcl_sprain",
      "meniscus_tear",
      "mcl_sprain",
      "lcl_sprain",
      "knee_sprain",
      "bone_bruise",
      "patellar_tendinitis",
      "knee_unspecified",
    ],
  );
});

test("MCL and meniscus chooses the more severe match and requests review", () => {
  const result = classify("MCL and meniscus");
  assert.equal(result.applies, true);
  assert.equal(result.id, "meniscus_tear");
  assert.equal(result.confidence, 0.6);
  assert.equal(result.needsReview, true);
  assert.deepEqual(result.matchedKeywords, ["meniscus", "mcl"]);
});

test("bare knee text is low confidence and requests review", () => {
  const result = classify("Knee");
  assert.equal(result.applies, true);
  assert.equal(result.id, "knee_unspecified");
  assert.equal(result.confidence, 0.35);
  assert.equal(result.needsReview, true);
});

test("a non-knee injury does not apply", () => {
  assert.deepEqual(classify("hamstring strain"), {
    applies: false,
    matchedKeywords: [],
    confidence: 0,
    needsReview: false,
  });
});

console.log(`\n${passed} passing\n`);
