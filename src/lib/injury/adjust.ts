import { classify } from "./classify.ts";
import { assess, type AvailabilityLabel } from "./risk.ts";

export interface InjuryAdjustedProjection {
  baseProjection: number;
  adjustedProjection: number;
  availability: number;
  label: AvailabilityLabel;
  benchFlag: boolean;
  note: string;
}

export function injuryAdjustedProjection(
  baseProjection: number,
  injuryText: string | null | undefined,
  designation: string | null | undefined,
  weeksSinceInjury: number | null,
): InjuryAdjustedProjection {
  const hasInjuryText = Boolean(injuryText?.trim());
  const hasDesignation = Boolean(designation?.trim());
  if (!hasInjuryText && !hasDesignation) return unchanged(baseProjection);

  const classification = classify(injuryText);
  if (!classification.applies && !hasDesignation) return unchanged(baseProjection);

  const assessment = assess(classification.applies ? classification : null, designation, weeksSinceInjury);
  const adjustedProjection = round2(baseProjection * assessment.availability);
  const context = classification.applies ? classification.label : designation?.trim() || "Injury status";

  return {
    baseProjection,
    adjustedProjection,
    availability: assessment.availability,
    label: assessment.label,
    benchFlag: assessment.availability < 0.5,
    note: `${context}: ${assessment.label} (${Math.round(assessment.availability * 100)}% availability); projection ${round2(baseProjection)} → ${adjustedProjection}.`,
  };
}

function unchanged(baseProjection: number): InjuryAdjustedProjection {
  return {
    baseProjection,
    adjustedProjection: baseProjection,
    availability: 1,
    label: "likely plays",
    benchFlag: false,
    note: "No knee injury adjustment applied.",
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
