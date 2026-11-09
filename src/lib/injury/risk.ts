import type { KneeInjuryCategory } from "./classify.ts";

export const DOUBTFUL_PLAY_RATE = 0;
export const QUESTIONABLE_PLAY_RATE = 0.64;

export const DESIGNATION_PLAY_RATES = {
  doubtful: DOUBTFUL_PLAY_RATE,
  questionable: QUESTIONABLE_PLAY_RATE,
} as const;

export const UNAVAILABLE_DESIGNATIONS = new Set([
  "out",
  "ir",
  "pup",
  "sus",
  "nfi",
  "dnr",
  "na",
  "cov",
]);

export const LIKELY_PLAYS_THRESHOLD = 0.75;
export const GAME_TIME_DECISION_THRESHOLD = 0.45;
export const LIKELY_OUT_THRESHOLD = 0.15;
export const RECOVERY_TARGET = 0.9;
export const HEALTHY_FLOOR = 0.8;

export type AvailabilityLabel = "likely plays" | "game time decision" | "likely out" | "out";

export interface InjuryAssessment {
  availability: number;
  label: AvailabilityLabel;
  reason: string;
  gamesRemainingLow: number;
  gamesRemainingHigh: number;
  seasonEnding: boolean;
}

export type InjuryAssessmentInput = Pick<
  KneeInjuryCategory,
  | "label"
  | "seasonEnding"
  | "gamesMissedLow"
  | "gamesMissedHigh"
  | "baseReturnProbability"
>;

export function assess(
  injury: InjuryAssessmentInput | null,
  designation: string | null | undefined,
  weeksSinceInjury: number | null,
): InjuryAssessment {
  const gamesRemaining = remainingGames(injury, weeksSinceInjury);

  if (injury?.seasonEnding) {
    return result(0, `${injury.label} is season ending.`, gamesRemaining, true);
  }

  const normalizedDesignation = designation?.trim().toLowerCase() ?? "";
  if (UNAVAILABLE_DESIGNATIONS.has(normalizedDesignation)) {
    return result(0, `${designation} means the player is unavailable.`, gamesRemaining, false);
  }
  if (normalizedDesignation === "doubtful") {
    return result(
      DESIGNATION_PLAY_RATES.doubtful,
      "Doubtful players rarely play.",
      gamesRemaining,
      false,
    );
  }
  if (normalizedDesignation === "questionable") {
    return result(
      DESIGNATION_PLAY_RATES.questionable,
      "Questionable players often play, but carry meaningful risk.",
      gamesRemaining,
      false,
    );
  }

  if (!injury) {
    return result(1, "No knee injury or limiting designation was found.", gamesRemaining, false);
  }

  const availability = recoveryAvailability(injury, weeksSinceInjury);
  return result(
    availability,
    `${injury.label} recovery is estimated from its games-missed range.`,
    gamesRemaining,
    false,
  );
}

function recoveryAvailability(
  injury: InjuryAssessmentInput,
  weeksSinceInjury: number | null,
): number {
  const base = injury.baseReturnProbability;
  if (weeksSinceInjury == null) return base;
  if (injury.gamesMissedHigh === 0) return Math.max(base, HEALTHY_FLOOR);
  if (weeksSinceInjury < injury.gamesMissedLow) return base * 0.5;
  if (weeksSinceInjury >= injury.gamesMissedHigh) return Math.min(RECOVERY_TARGET, base + 0.5);

  const window = injury.gamesMissedHigh - injury.gamesMissedLow;
  const progress = window === 0 ? 1 : (weeksSinceInjury - injury.gamesMissedLow) / window;
  return base + (RECOVERY_TARGET - base) * progress;
}

function remainingGames(
  injury: InjuryAssessmentInput | null,
  weeksSinceInjury: number | null,
): { low: number; high: number } {
  if (!injury) return { low: 0, high: 0 };
  const elapsed = Math.max(0, weeksSinceInjury ?? 0);
  return {
    low: Math.max(0, injury.gamesMissedLow - elapsed),
    high: Math.max(0, injury.gamesMissedHigh - elapsed),
  };
}

function result(
  availability: number,
  reason: string,
  gamesRemaining: { low: number; high: number },
  seasonEnding: boolean,
): InjuryAssessment {
  const boundedAvailability = Math.max(0, Math.min(1, availability));
  return {
    availability: boundedAvailability,
    label: availabilityLabel(boundedAvailability),
    reason,
    gamesRemainingLow: gamesRemaining.low,
    gamesRemainingHigh: gamesRemaining.high,
    seasonEnding,
  };
}

function availabilityLabel(availability: number): AvailabilityLabel {
  if (availability >= LIKELY_PLAYS_THRESHOLD) return "likely plays";
  if (availability >= GAME_TIME_DECISION_THRESHOLD) return "game time decision";
  if (availability >= LIKELY_OUT_THRESHOLD) return "likely out";
  return "out";
}
