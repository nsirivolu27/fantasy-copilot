import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  fetchInjuryReports,
  fetchParticipation,
  fetchSchedule,
} from "../src/lib/data/nflverse.ts";
import { calibrateInjuryRisk } from "../src/lib/injury/calibrate.ts";
import { getKneeInjuryCategories } from "../src/lib/injury/classify.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mapPath = path.join(root, "src", "lib", "injury", "knee-injury-severity-map.json");
const riskPath = path.join(root, "src", "lib", "injury", "risk.ts");
const summaryPath = path.join(root, "src", "lib", "injury", "calibration-summary.json");
const seasons = readSeasons(process.argv.slice(2));

const reports = [];
const participation = [];
for (const season of seasons) {
  console.log(`[injury calibration] loading ${season}`);
  reports.push(...await fetchInjuryReports(String(season)));
  participation.push(...await fetchParticipation(String(season)));
}

const schedule = (await fetchSchedule()).filter((game) => seasons.includes(Number(game.season)));
const categories = getKneeInjuryCategories();
const calibration = calibrateInjuryRisk(reports, participation, schedule, categories);

const calibratedMap = categories.map((category) => {
  const measured = calibration.categories.find((row) => row.id === category.id);
  if (!measured) return category;
  return {
    ...category,
    gamesMissedLow: measured.gamesMissedLow ?? category.gamesMissedLow,
    gamesMissedHigh: measured.gamesMissedHigh ?? category.gamesMissedHigh,
    baseReturnProbability: measured.baseReturnProbability ?? category.baseReturnProbability,
  };
});
await writeFile(mapPath, `${JSON.stringify(calibratedMap, null, 2)}\n`);

let riskSource = await readFile(riskPath, "utf8");
riskSource = replaceRate(riskSource, "DOUBTFUL_PLAY_RATE", calibration.designationPlayRates.doubtful);
riskSource = replaceRate(
  riskSource,
  "QUESTIONABLE_PLAY_RATE",
  calibration.designationPlayRates.questionable,
);
await writeFile(riskPath, riskSource);

const summary = {
  seasons,
  sources: {
    injuries: "https://github.com/nflverse/nflverse-data/releases/tag/injuries",
    participation: "https://github.com/nflverse/nflverse-data/releases/tag/snap_counts",
    playerIds: "https://github.com/nflverse/nflverse-data/releases/tag/weekly_rosters",
    schedule: "https://github.com/nflverse/nflverse-data/releases/tag/schedules",
  },
  inputCounts: {
    injuryReports: reports.length,
    participationWeeks: participation.length,
    scheduledGames: schedule.length,
    classifiedKneeReports: calibration.categories.reduce((sum, row) => sum + row.reportCount, 0),
  },
  method: {
    played: "Player logged at least one offense, defense, or special-teams snap.",
    episode: "Consecutive injury-report weeks for one player and category form one episode.",
    gamesMissedRange: "25th and 75th percentiles of scheduled regular-season games missed from episode start.",
    baseReturnProbability: "Share of category injury-report weeks in which the player logged a snap.",
    designationPlayRate: "Share of knee injury-report weeks at that designation in which the player logged a snap.",
  },
  ...calibration,
};
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

console.table(calibration.categories);
console.log("Designation play rates:", calibration.designationPlayRates);

function replaceRate(source, constantName, measuredRate) {
  if (measuredRate == null) throw new Error(`No measured value for ${constantName}.`);
  const pattern = new RegExp(`export const ${constantName} = [0-9.]+;`);
  if (!pattern.test(source)) throw new Error(`Could not find ${constantName} in risk.ts.`);
  return source.replace(pattern, `export const ${constantName} = ${measuredRate};`);
}

function readSeasons(args) {
  if (args.length === 0) return Array.from({ length: 10 }, (_, index) => 2016 + index);
  const values = args.flatMap((value) => {
    const [start, end] = value.split("-").map(Number);
    if (!Number.isInteger(start)) throw new Error(`Invalid season: ${value}`);
    if (end == null) return [start];
    if (!Number.isInteger(end) || end < start) throw new Error(`Invalid season range: ${value}`);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
  return [...new Set(values)];
}
