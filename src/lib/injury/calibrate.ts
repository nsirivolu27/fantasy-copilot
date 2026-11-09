import type { NflverseInjuryReport, NflverseParticipation } from "../data/nflverse.ts";
import { classify, type KneeInjuryCategory } from "./classify.ts";

export interface ScheduledGame {
  season: string;
  week: number;
  gameType: string;
  awayTeam: string;
  homeTeam: string;
}

export interface CategoryCalibration {
  id: string;
  reportCount: number;
  episodeCount: number;
  gamesMissedLow: number | null;
  gamesMissedHigh: number | null;
  baseReturnProbability: number | null;
}

export interface InjuryCalibration {
  categories: CategoryCalibration[];
  designationPlayRates: {
    doubtful: number | null;
    questionable: number | null;
  };
  designationSampleCounts: {
    doubtful: number;
    questionable: number;
  };
}

interface ClassifiedReport extends NflverseInjuryReport {
  categoryId: string;
  played: boolean;
}

export function calibrateInjuryRisk(
  reports: NflverseInjuryReport[],
  participation: NflverseParticipation[],
  schedule: ScheduledGame[],
  categories: KneeInjuryCategory[],
): InjuryCalibration {
  const playedWeeks = buildPlayedWeeks(participation);
  const classifiedReports = reports.flatMap((report): ClassifiedReport[] => {
    const injury = classify(report.injuryText);
    if (!injury.applies) return [];
    return [{
      ...report,
      categoryId: injury.id,
      played: playedWeeks.has(playerWeekKey(report.season, report.week, report.gsisId)),
    }];
  });

  const teamWeeks = buildTeamWeeks(schedule);
  const missedGames = measureEpisodes(classifiedReports, playedWeeks, teamWeeks);

  return {
    categories: categories.map((category) => {
      const categoryReports = classifiedReports.filter((report) => report.categoryId === category.id);
      const values = missedGames.get(category.id) ?? [];
      return {
        id: category.id,
        reportCount: categoryReports.length,
        episodeCount: values.length,
        gamesMissedLow: values.length ? percentile(values, 0.25) : null,
        gamesMissedHigh: values.length ? percentile(values, 0.75) : null,
        baseReturnProbability: categoryReports.length
          ? roundRate(categoryReports.filter((report) => report.played).length / categoryReports.length)
          : null,
      };
    }),
    designationPlayRates: {
      doubtful: playRate(classifiedReports, "doubtful"),
      questionable: playRate(classifiedReports, "questionable"),
    },
    designationSampleCounts: {
      doubtful: designationReports(classifiedReports, "doubtful").length,
      questionable: designationReports(classifiedReports, "questionable").length,
    },
  };
}

function buildPlayedWeeks(participation: NflverseParticipation[]): Set<string> {
  const played = new Set<string>();
  for (const game of participation) {
    for (const gsisId of game.gsisIds) played.add(playerWeekKey(game.season, game.week, gsisId));
  }
  return played;
}

function buildTeamWeeks(schedule: ScheduledGame[]): Map<string, number[]> {
  const byTeam = new Map<string, Set<number>>();
  for (const game of schedule) {
    if (game.gameType !== "REG") continue;
    for (const team of [game.awayTeam, game.homeTeam]) {
      const key = `${game.season}:${team}`;
      const weeks = byTeam.get(key) ?? new Set<number>();
      weeks.add(game.week);
      byTeam.set(key, weeks);
    }
  }
  return new Map([...byTeam].map(([key, weeks]) => [key, [...weeks].sort((a, b) => a - b)]));
}

function measureEpisodes(
  reports: ClassifiedReport[],
  playedWeeks: Set<string>,
  teamWeeks: Map<string, number[]>,
): Map<string, number[]> {
  const byPlayerCategory = new Map<string, ClassifiedReport[]>();
  for (const report of reports) {
    const key = `${report.season}:${report.gsisId}:${report.categoryId}`;
    const rows = byPlayerCategory.get(key) ?? [];
    rows.push(report);
    byPlayerCategory.set(key, rows);
  }

  const out = new Map<string, number[]>();
  for (const rows of byPlayerCategory.values()) {
    rows.sort((a, b) => a.week - b.week);
    let previousWeek: number | null = null;
    for (const report of rows) {
      if (previousWeek != null && report.week <= previousWeek + 1) {
        previousWeek = report.week;
        continue;
      }
      previousWeek = report.week;

      const scheduledWeeks = teamWeeks.get(`${report.season}:${report.team}`) ?? [];
      let missed = 0;
      let returned = false;
      for (const week of scheduledWeeks) {
        if (week < report.week) continue;
        if (playedWeeks.has(playerWeekKey(report.season, week, report.gsisId))) {
          returned = true;
          break;
        }
        missed++;
      }
      if (!returned) continue;
      const values = out.get(report.categoryId) ?? [];
      values.push(missed);
      out.set(report.categoryId, values);
    }
  }
  return out;
}

function playRate(reports: ClassifiedReport[], designation: string): number | null {
  const matching = designationReports(reports, designation);
  if (!matching.length) return null;
  return roundRate(matching.filter((report) => report.played).length / matching.length);
}

function designationReports(
  reports: ClassifiedReport[],
  designation: string,
): ClassifiedReport[] {
  return reports.filter(
    (report) => report.reportStatus?.trim().toLowerCase() === designation,
  );
}

function percentile(values: number[], probability: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.round((sorted.length - 1) * probability);
  return sorted[index];
}

function roundRate(value: number): number {
  return Math.round(value * 100) / 100;
}

function playerWeekKey(season: string, week: number, gsisId: string): string {
  return `${season}:${week}:${gsisId}`;
}
