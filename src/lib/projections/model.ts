/**
 * The projection model, v1.
 *
 * Deliberately simple and explainable. It takes games that have ALREADY been
 * scored with the league's own settings (see scoring.ts) — the model never
 * sees a stat line, so it can't assume a scoring format. The output carries
 * floor, ceiling, confidence and human-readable reasoning, because a bare
 * point estimate isn't a decision aid.
 *
 * Zero imports on purpose: pure, unit testable, and usable in a backtest.
 */

export const MODEL_VERSION = "v2-season-anchored";

/**
 * Weight on the opportunity model versus the season average, fitted per
 * position by scripts/backtest.mjs on the 2024 regular season (3,415
 * player-weeks). QBs benefit most from usage signal; WRs almost not at all,
 * because target volume swings week to week.
 *
 * These are measured, not chosen. Re-fit them when the model changes.
 */
const OPPORTUNITY_WEIGHT: Record<string, number> = {
  QB: 0.8,
  RB: 0.4,
  WR: 0.2,
  TE: 0.3,
};
const DEFAULT_OPPORTUNITY_WEIGHT = 0.3;

/** Most recent game first. */
export interface GameLine {
  week: number;
  /** Fantasy points this game was worth IN THIS LEAGUE, scored by scoring.ts. */
  points: number;
  /** Touches or targets — drives role stability, never the point estimate. */
  opportunity: number;
}

export interface ProjectionInput {
  games: GameLine[];
  position?: string;
  /**
   * Season-to-date averages. These anchor the projection, because weekly
   * fantasy scoring is noisy enough that a season average is a genuinely hard
   * baseline to beat — see the backtest numbers in the README.
   */
  seasonAveragePoints?: number;
  seasonAverageOpportunity?: number;
  /** Season-long points per opportunity — the efficiency term. */
  seasonPointsPerOpportunity?: number;
  /** Multiplier from the opponent's points allowed to this position. */
  matchupMultiplier?: number;
  /** Sleeper injury designation: Out, Doubtful, Questionable, IR, etc. */
  injuryStatus?: string | null;
  isByeWeek?: boolean;
  /** Replacement-level points for this position, used when a player has no history. */
  replacementLevel?: number;
}

export interface ProjectionOutput {
  projectedPoints: number;
  floor: number;
  ceiling: number;
  confidence: number;
  reasoning: string[];
  modelVersion: string;
}

/** Recency weights for the last four games. */
const RECENCY_WEIGHTS = [0.4, 0.3, 0.2, 0.1];
/** Matchup adjustment is capped so it can never dominate the projection. */
const MATCHUP_CAP = 0.15;

const OUT_STATUSES = new Set(["OUT", "IR", "PUP", "SUSP", "NA", "DOUBTFUL"]);

export function project(input: ProjectionInput): ProjectionOutput {
  const reasoning: string[] = [];
  const replacement = input.replacementLevel ?? 0;

  if (input.isByeWeek) {
    return zero("On bye this week.", reasoning);
  }

  const status = (input.injuryStatus ?? "").toUpperCase();
  if (status && OUT_STATUSES.has(status)) {
    return zero(`Listed ${input.injuryStatus} — projected zero.`, reasoning);
  }

  const games = input.games.slice(0, 4);
  if (games.length === 0) {
    return {
      projectedPoints: round2(replacement),
      floor: 0,
      ceiling: round2(replacement * 1.8),
      confidence: 0.1,
      reasoning: ["No game history — using positional replacement level."],
      modelVersion: MODEL_VERSION,
    };
  }

  // Games arrive already scored in this league's format.
  const scored = games.map((g) => g.points);

  // 1. Recency-weighted recent form, renormalized for however many games exist.
  const weights = RECENCY_WEIGHTS.slice(0, scored.length);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const recentPoints = scored.reduce((sum, pts, i) => sum + pts * weights[i], 0) / weightSum;

  // 2. Two estimates, then blend.
  //
  //    (a) Season average — the anchor. Boring and hard to beat.
  //    (b) Opportunity model — recent weighted usage times season-long
  //        efficiency. Usage is more stable than points, so this reacts to a
  //        role change without overreacting to one big touchdown week.
  const seasonPoints = input.seasonAveragePoints ?? recentPoints;
  const ppo = input.seasonPointsPerOpportunity ?? 0;
  const recentOpportunity =
    games.reduce((sum, g, i) => sum + g.opportunity * weights[i], 0) / weightSum;

  const hasOpportunitySignal = ppo > 0 && recentOpportunity > 0;
  const opportunityEstimate = hasOpportunitySignal ? ppo * recentOpportunity : seasonPoints;

  const alpha = OPPORTUNITY_WEIGHT[input.position ?? ""] ?? DEFAULT_OPPORTUNITY_WEIGHT;
  let base = alpha * opportunityEstimate + (1 - alpha) * seasonPoints;

  reasoning.push(
    `Season average ${seasonPoints.toFixed(1)}, recent form ${recentPoints.toFixed(1)}.`,
  );
  if (hasOpportunitySignal) {
    reasoning.push(
      `Recent usage ${recentOpportunity.toFixed(1)} touches/targets at ${ppo.toFixed(2)} pts each → ${opportunityEstimate.toFixed(1)}; blended ${(alpha * 100).toFixed(0)}% usage / ${((1 - alpha) * 100).toFixed(0)}% season average.`,
    );
  }

  // 3. With almost no history, pull toward replacement level.
  if (scored.length < 2 && replacement > 0) {
    base = base * 0.5 + replacement * 0.5;
    reasoning.push(`Only ${scored.length} game of history — regressed halfway to replacement level.`);
  }

  // 4. Matchup, capped.
  const rawMultiplier = input.matchupMultiplier ?? 1;
  const multiplier = clamp(rawMultiplier, 1 - MATCHUP_CAP, 1 + MATCHUP_CAP);
  if (Math.abs(multiplier - 1) > 0.01) {
    base *= multiplier;
    reasoning.push(
      `${multiplier > 1 ? "Favorable" : "Tough"} matchup: ${((multiplier - 1) * 100).toFixed(0)}%.`,
    );
  }

  // 5. Questionable players keep playing but carry risk.
  if (status === "QUESTIONABLE") {
    base *= 0.85;
    reasoning.push("Listed Questionable — 15% haircut and lower confidence.");
  }

  // 6. Floor and ceiling from the player's own spread, widened on thin samples.
  const spread = percentileSpread(scored);
  const widen = scored.length >= 4 ? 1 : 1.25;
  const floor = Math.max(0, base - spread * widen);
  const ceiling = base + spread * widen;

  // 7. Confidence: sample size, role stability, injury certainty.
  const confidence = computeConfidence({
    gameCount: scored.length,
    opportunities: games.map((g) => g.opportunity),
    questionable: status === "QUESTIONABLE",
  });

  reasoning.push(
    `Role stability across ${games.length} games gives ${(confidence * 100).toFixed(0)}% confidence.`,
  );

  return {
    projectedPoints: round2(base),
    floor: round2(floor),
    ceiling: round2(ceiling),
    confidence: round2(confidence),
    reasoning,
    modelVersion: MODEL_VERSION,
  };
}

function zero(message: string, reasoning: string[]): ProjectionOutput {
  return {
    projectedPoints: 0,
    floor: 0,
    ceiling: 0,
    confidence: 0.95,
    reasoning: [...reasoning, message],
    modelVersion: MODEL_VERSION,
  };
}

/** Half the gap between the 20th and 80th percentile of recent scores. */
export function percentileSpread(values: number[]): number {
  if (values.length < 2) return Math.max(2, (values[0] ?? 0) * 0.4);
  const sorted = [...values].sort((a, b) => a - b);
  const p20 = quantile(sorted, 0.2);
  const p80 = quantile(sorted, 0.8);
  return Math.max(1, (p80 - p20) / 2);
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

export function computeConfidence(args: {
  gameCount: number;
  opportunities: number[];
  questionable: boolean;
}): number {
  // Sample size: 4 games is as confident as this model gets on history alone.
  const sample = Math.min(args.gameCount, 4) / 4;

  // Role stability: low variation in touches means a predictable role.
  const opps = args.opportunities.filter((o) => Number.isFinite(o));
  const mean = opps.reduce((a, b) => a + b, 0) / (opps.length || 1);
  const variance = opps.reduce((sum, o) => sum + (o - mean) ** 2, 0) / (opps.length || 1);
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const stability = clamp(1 - cv, 0, 1);

  let confidence = 0.25 + 0.45 * sample + 0.3 * stability;
  if (args.questionable) confidence *= 0.75;
  return clamp(confidence, 0.05, 0.95);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
