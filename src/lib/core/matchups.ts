/**
 * Defensive strength by position, and the schedule lookups the streaming
 * planner needs.
 *
 * Zero imports: pure, unit testable, self-contained.
 */

export interface AllowedRow {
  /** The defense that gave up these points. */
  opponentTeam: string;
  position: string;
  points: number;
}

export interface DefenseStrength {
  /** Average fantasy points allowed to this position, per game. */
  pointsAllowed: number;
  games: number;
  /** 1.0 is league average; >1 means the defense is generous. */
  multiplier: number;
}

/**
 * Points allowed to each position, per defense.
 *
 * The multiplier is capped in the projection model, not here, this function
 * reports what happened and lets the caller decide how much to trust it.
 */
export function pointsAllowedByDefense(
  rows: AllowedRow[],
): Record<string, Record<string, DefenseStrength>> {
  const totals = new Map<string, { sum: number; weeks: Set<string> }>();
  const leagueByPosition = new Map<string, { sum: number; count: number }>();

  for (const row of rows) {
    if (!row.opponentTeam || !row.position) continue;
    const key = `${row.opponentTeam}|${row.position}`;
    if (!totals.has(key)) totals.set(key, { sum: 0, weeks: new Set() });
    const entry = totals.get(key) as { sum: number; weeks: Set<string> };
    entry.sum += row.points;
  }

  // Games per defense/position pair: count distinct opponents' weeks by
  // re-walking, since several players share one defensive matchup.
  const gameCount = new Map<string, Set<number>>();
  for (const row of rows as (AllowedRow & { week?: number })[]) {
    const key = `${row.opponentTeam}|${row.position}`;
    if (!gameCount.has(key)) gameCount.set(key, new Set());
    (gameCount.get(key) as Set<number>).add(row.week ?? 0);
  }

  for (const [key, entry] of totals) {
    const position = key.split("|")[1];
    const games = gameCount.get(key)?.size || 1;
    const perGame = entry.sum / games;
    if (!leagueByPosition.has(position)) leagueByPosition.set(position, { sum: 0, count: 0 });
    const league = leagueByPosition.get(position) as { sum: number; count: number };
    league.sum += perGame;
    league.count += 1;
  }

  const out: Record<string, Record<string, DefenseStrength>> = {};
  for (const [key, entry] of totals) {
    const [team, position] = key.split("|");
    const games = gameCount.get(key)?.size || 1;
    const perGame = entry.sum / games;
    const league = leagueByPosition.get(position);
    const average = league && league.count ? league.sum / league.count : perGame;

    if (!out[team]) out[team] = {};
    out[team][position] = {
      pointsAllowed: Math.round(perGame * 100) / 100,
      games,
      multiplier: average > 0 ? Math.round((perGame / average) * 1000) / 1000 : 1,
    };
  }
  return out;
}

export interface ScheduleRow {
  season: string;
  week: number;
  homeTeam: string;
  awayTeam: string;
}

/** The next `count` opponents for one NFL team, with bye weeks marked null. */
export function upcomingOpponents(
  schedule: ScheduleRow[],
  team: string,
  fromWeek: number,
  count = 3,
): { week: number; opponent: string | null; isHome: boolean }[] {
  const out: { week: number; opponent: string | null; isHome: boolean }[] = [];

  for (let week = fromWeek; out.length < count && week <= fromWeek + 12; week++) {
    const game = schedule.find(
      (g) => g.week === week && (g.homeTeam === team || g.awayTeam === team),
    );
    if (game) {
      out.push({
        week,
        opponent: game.homeTeam === team ? game.awayTeam : game.homeTeam,
        isHome: game.homeTeam === team,
      });
    } else {
      // No game that week is a bye, which is exactly what a streamer needs to
      // see, it's the week the plan breaks.
      out.push({ week, opponent: null, isHome: false });
    }
  }

  return out;
}
