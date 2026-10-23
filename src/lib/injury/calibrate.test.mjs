import assert from "node:assert/strict";
import { calibrateInjuryRisk } from "./calibrate.ts";
import { getKneeInjuryCategories } from "./classify.ts";

const reports = [
  report(1, "MCL", "Questionable"),
  report(2, "MCL", "Questionable"),
  report(4, "MCL", "Doubtful"),
  report(3, "ACL", "Out", "player-2"),
];
const participation = [
  { season: "2024", week: 2, gsisIds: ["player-1"] },
  { season: "2024", week: 4, gsisIds: ["player-1"] },
];
const schedule = [1, 2, 3, 4].map((week) => ({
  season: "2024",
  week,
  gameType: "REG",
  awayTeam: "AAA",
  homeTeam: "BBB",
}));

const calibration = calibrateInjuryRisk(
  reports,
  participation,
  schedule,
  getKneeInjuryCategories(),
);
const mcl = calibration.categories.find((category) => category.id === "mcl_sprain");

assert.equal(mcl.reportCount, 3);
assert.equal(mcl.episodeCount, 2);
assert.equal(mcl.gamesMissedLow, 0);
assert.equal(mcl.gamesMissedHigh, 1);
assert.equal(mcl.baseReturnProbability, 0.67);
assert.equal(calibration.designationPlayRates.questionable, 0.5);
assert.equal(calibration.designationPlayRates.doubtful, 1);
assert.equal(calibration.designationSampleCounts.questionable, 2);
assert.equal(calibration.designationSampleCounts.doubtful, 1);

console.log("\nInjury calibration\n");
console.log("  ok  injury episodes join to actual player participation");
console.log("\n1 passing\n");

function report(week, injuryText, reportStatus, gsisId = "player-1") {
  return {
    season: "2024",
    seasonType: "REG",
    team: "AAA",
    week,
    gsisId,
    position: "RB",
    fullName: "Test Player",
    injuryText,
    reportStatus,
  };
}
