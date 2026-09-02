// Backtests the projection model against real nflverse data.
//
//   node --experimental-strip-types scripts/backtest.mjs [season] [csvPath]
//
// Honest by design: it reports mean absolute error against three baselines and
// says plainly when the model loses. If the model can't beat the season-average
// baseline, ship the baseline.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { parseCsv, num } from "../src/lib/data/csv.ts";
import { scoreStatLine } from "../src/lib/projections/scoring.ts";
import { project } from "../src/lib/projections/model.ts";

const season = process.argv[2] ?? "2024";
const csvPath = process.argv[3] ?? `player_stats_${season}.csv`;
const PPR = {
  pass_yd: 0.04, pass_td: 4, pass_int: -2,
  rush_yd: 0.1, rush_td: 6,
  rec: 1, rec_yd: 0.1, rec_td: 6,
  fum_lost: -2,
};
const POSITIONS = ["QB", "RB", "WR", "TE"];
const FIRST_WEEK = 5;
const LAST_WEEK = 17;
/** Ignore deep bench noise: require real usage in the games we learn from. */
const MIN_PRIOR_GAMES = 2;

if (!existsSync(csvPath)) {
  console.error(
    `Missing ${csvPath}. Download it first:\n` +
      `  curl -L -o ${csvPath} https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${season}.csv`,
  );
  process.exit(1);
}

const rows = parseCsv(readFileSync(csvPath, "utf8")).filter(
  (r) => POSITIONS.includes(r.position) && (r.season_type ?? "REG") === "REG",
);

// Group each player's weeks, scored in this league's format.
const byPlayer = new Map();
for (const r of rows) {
  const week = num(r.week);
  if (week == null) continue;
  const stats = {};
  for (const [k, v] of Object.entries(r)) {
    const n = num(v);
    if (n != null) stats[k] = n;
  }
  const points = scoreStatLine(stats, PPR, r.position).points;
  // QBs are driven by pass attempts; skill players by targets and carries.
  const opportunity =
    r.position === "QB"
      ? (num(r.attempts) ?? 0) + (num(r.carries) ?? 0)
      : (num(r.targets) ?? 0) + (num(r.carries) ?? 0);
  if (!byPlayer.has(r.player_id)) {
    byPlayer.set(r.player_id, { position: r.position, name: r.player_display_name, weeks: new Map() });
  }
  byPlayer.get(r.player_id).weeks.set(week, { week, points, opportunity });
}

const errors = { model: [], lastWeek: [], seasonAvg: [] };
const byPosition = {};
for (const p of POSITIONS) byPosition[p] = { model: [], lastWeek: [], seasonAvg: [] };

for (const [, player] of byPlayer) {
  for (let week = FIRST_WEEK; week <= LAST_WEEK; week++) {
    const actual = player.weeks.get(week);
    if (!actual) continue; // didn't play — nothing to predict against

    const prior = [];
    for (let w = week - 1; w >= 1 && prior.length < 4; w--) {
      const g = player.weeks.get(w);
      if (g) prior.push(g);
    }
    if (prior.length < MIN_PRIOR_GAMES) continue;

    const all = [];
    const allGames = [];
    for (let w = 1; w < week; w++) {
      const g = player.weeks.get(w);
      if (g) {
        all.push(g.points);
        allGames.push(g);
      }
    }

    const totalPoints = all.reduce((a, b) => a + b, 0);
    const totalOpportunity = allGames.reduce((a, b) => a + b.opportunity, 0);
    const projected = project({
      games: prior,
      position: player.position,
      seasonAveragePoints: totalPoints / all.length,
      seasonAverageOpportunity: totalOpportunity / allGames.length,
      seasonPointsPerOpportunity: totalOpportunity > 0 ? totalPoints / totalOpportunity : 0,
    }).projectedPoints;
    const lastWeek = prior[0].points;
    const seasonAvg = all.reduce((a, b) => a + b, 0) / all.length;

    const e = {
      model: Math.abs(projected - actual.points),
      lastWeek: Math.abs(lastWeek - actual.points),
      seasonAvg: Math.abs(seasonAvg - actual.points),
    };
    for (const k of Object.keys(e)) {
      errors[k].push(e[k]);
      byPosition[player.position][k].push(e[k]);
    }
  }
}

const mae = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (n) => (Number.isNaN(n) ? "  n/a" : n.toFixed(2).padStart(5));

console.log(`\nBacktest — ${season} regular season, weeks ${FIRST_WEEK}-${LAST_WEEK}, full PPR`);
console.log(`${errors.model.length} player-weeks predicted\n`);
console.log("                model   last wk  season avg   verdict");
console.log("            ---------------------------------------------");

function line(label, m, l, s) {
  const best = Math.min(m, l, s);
  const verdict = m === best ? "model wins" : m < s ? "beats season avg" : "LOSES to baseline";
  console.log(`  ${label.padEnd(9)} ${fmt(m)}    ${fmt(l)}     ${fmt(s)}    ${verdict}`);
}

for (const p of POSITIONS) {
  line(p, mae(byPosition[p].model), mae(byPosition[p].lastWeek), mae(byPosition[p].seasonAvg));
}
console.log("            ---------------------------------------------");
line("ALL", mae(errors.model), mae(errors.lastWeek), mae(errors.seasonAvg));

const m = mae(errors.model);
const s = mae(errors.seasonAvg);
const improvement = ((s - m) / s) * 100;
console.log(
  `\n  Model is ${improvement >= 0 ? improvement.toFixed(1) + "% better" : Math.abs(improvement).toFixed(1) + "% WORSE"} than the season-average baseline.`,
);
console.log(
  improvement < 2
    ? "  Small. Weekly fantasy scoring is mostly noise, so a season average is a\n" +
      "  hard baseline. Treat the projection as a commodity and put the effort\n" +
      "  into decision leverage instead (see the README).\n"
    : "  Mean absolute error is in fantasy points per game.\n",
);

writeFileSync(
  "backtest-results.json",
  JSON.stringify(
    { season, playerWeeks: errors.model.length, mae: { model: m, lastWeek: mae(errors.lastWeek), seasonAvg: s } },
    null,
    2,
  ),
);
