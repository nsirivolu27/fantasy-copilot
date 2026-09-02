/**
 * Bye weeks, derived rather than hardcoded.
 *
 * No free source publishes a bye-week list directly, but nflverse publishes
 * every game. A team's bye is simply the regular-season week in which it does
 * not appear — which stays correct every season with no maintenance.
 *
 * Zero imports: pure, unit testable, and safe to share.
 */

export interface ScheduledGame {
  season: string;
  week: number;
  gameType: string;
  awayTeam: string;
  homeTeam: string;
}

export interface ByeWeekResult {
  /** NFL team code -> bye week. */
  byeByTeam: Record<string, number>;
  /** Teams whose schedule didn't resolve to exactly one bye. */
  anomalies: { team: string; weeks: number[] }[];
  weeksCovered: number[];
}

export function deriveByeWeeks(games: ScheduledGame[], season: string): ByeWeekResult {
  const regular = games.filter((g) => g.season === season && g.gameType === "REG");

  const weeks = [...new Set(regular.map((g) => g.week))].sort((a, b) => a - b);
  const playingByWeek = new Map<number, Set<string>>();
  const teams = new Set<string>();

  for (const g of regular) {
    if (!playingByWeek.has(g.week)) playingByWeek.set(g.week, new Set());
    const set = playingByWeek.get(g.week) as Set<string>;
    set.add(g.awayTeam);
    set.add(g.homeTeam);
    teams.add(g.awayTeam);
    teams.add(g.homeTeam);
  }

  const byeByTeam: Record<string, number> = {};
  const anomalies: { team: string; weeks: number[] }[] = [];

  for (const team of [...teams].sort()) {
    const off = weeks.filter((w) => !playingByWeek.get(w)?.has(team));
    if (off.length === 1) {
      byeByTeam[team] = off[0];
    } else {
      // An expanded season, a cancelled game, or a partial file. Report it
      // rather than guessing — a wrong bye week is worse than a missing one.
      anomalies.push({ team, weeks: off });
    }
  }

  return { byeByTeam, anomalies, weeksCovered: weeks };
}
