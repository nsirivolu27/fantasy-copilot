import severityMapJson from "./knee-injury-severity-map.json" with { type: "json" };

export interface KneeInjuryCategory {
  id: string;
  label: string;
  keywords: string[];
  severityTier: 1 | 2 | 3 | 4;
  seasonEnding: boolean;
  gamesMissedLow: number;
  gamesMissedHigh: number;
  baseReturnProbability: number;
}

export interface ClassifiedKneeInjury extends KneeInjuryCategory {
  applies: true;
  matchedKeywords: string[];
  confidence: number;
  needsReview: boolean;
}

export interface UnclassifiedInjury {
  applies: false;
  matchedKeywords: [];
  confidence: 0;
  needsReview: false;
}

export type InjuryClassification = ClassifiedKneeInjury | UnclassifiedInjury;

const FALLBACK_IDS = new Set(["knee_sprain", "knee_unspecified"]);

export function getKneeInjuryCategories(): KneeInjuryCategory[] {
  return severityMapJson as KneeInjuryCategory[];
}

export function classify(text: string | null | undefined): InjuryClassification {
  const normalizedText = text?.trim().toLowerCase() ?? "";
  if (!normalizedText) return noMatch();

  const matches = getKneeInjuryCategories()
    .map((category) => ({
      category,
      keywords: category.keywords.filter((keyword) => normalizedText.includes(keyword)),
    }))
    .filter((match) => match.keywords.length > 0);

  if (matches.length === 0) return noMatch();

  const specificMatches = matches.filter(({ category }) => !FALLBACK_IDS.has(category.id));
  if (specificMatches.length > 0) {
    const selected = specificMatches.reduce((highest, current) =>
      current.category.severityTier > highest.category.severityTier ? current : highest,
    );
    return {
      ...selected.category,
      applies: true,
      matchedKeywords: uniqueKeywords(specificMatches),
      confidence: specificMatches.length > 1 ? 0.6 : 0.9,
      needsReview: specificMatches.length > 1,
    };
  }

  const selected = matches.find(({ category }) => category.id === "knee_sprain") ?? matches[0];
  const unspecified = selected.category.id === "knee_unspecified";
  return {
    ...selected.category,
    applies: true,
    matchedKeywords: uniqueKeywords(matches),
    confidence: unspecified ? 0.35 : 0.6,
    needsReview: unspecified,
  };
}

function uniqueKeywords(matches: { keywords: string[] }[]): string[] {
  return [...new Set(matches.flatMap((match) => match.keywords))];
}

function noMatch(): UnclassifiedInjury {
  return { applies: false, matchedKeywords: [], confidence: 0, needsReview: false };
}
