/**
 * League-level math: power rankings, matchup simulation, playoff odds.
 *
 * The simulator is seeded so results are reproducible — a win probability that
 * changes on every page load is worse than useless, and an unseeded Monte
 * Carlo can't be unit tested.
 *
 * Zero imports: pure, self-contained, testable.
 */

// ── Seeded RNG ───────────────────────────────────────────────────────────────

/** mulberry32 — small, fast, good enough for Monte Carlo, and deterministic. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller, so a projection's spread turns into plausible weekly outcomes. */
export function sampleNormal(rng: () => number, mean: number, stdDev: number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

// ── Power rankings ───────────────────────────────────────────────────────────

export interface TeamRecord {
  teamId: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface PowerRanking extends TeamRecord {
  rank: number;
  /** Wins this team "should" have, given how its scores rank league-wide. */
  expectedWins: number;
  /** Actual minus expected. Positive means the schedule has been kind. */
  luck: number;
  /** 0..100, blending scoring rate and record. */
  powerScore: number;
}

/**
 * Ranks teams by underlying strength rather than record.
 *
 * Expected wins come from scoring rate: a team scoring at the 80th percentile
 * of the league should beat a random opponent 80% of the time, so over N games
 * it "should" have 0.8N wins. The gap between that and its actual record is
 * schedule luck, which is the thing a standings table hides.
 */
export function powerRankings(teams: TeamRecord[]): PowerRanking[] {
  if (teams.length === 0) return [];

  const gamesPlayed = (t: TeamRecord) => t.wins + t.losses + t.ties;
  const maxGames = Math.max(...teams.map(gamesPlayed), 1);
  const pointsPerGame = (t: TeamRecord) => t.pointsFor / Math.max(gamesPlayed(t), 1);

  const rates = teams.map(pointsPerGame);
  const best = Math.max(...rates);
  const worst = Math.min(...rates);
  const span = best - worst || 1;

  const ranked = teams.map((team) => {
    const played = gamesPlayed(team);
    // Share of the league this team out-scores, per game.
    const beats = teams.filter((other) => other.teamId !== team.teamId && pointsPerGame(other) < pointsPerGame(team)).length;
    const winRate = teams.length > 1 ? beats / (teams.length - 1) : 0.5;
    const expectedWins = Math.round(winRate * played * 100) / 100;
    const actualWins = team.wins + team.ties * 0.5;

    // 70% scoring rate, 30% actual record — strength first, but a team that
    // keeps winning shouldn't be ranked as if results are meaningless.
    const scoreComponent = ((pointsPerGame(team) - worst) / span) * 100;
    const recordComponent = played > 0 ? (actualWins / played) * 100 : 50;
    const powerScore = Math.round((scoreComponent * 0.7 + recordComponent * 0.3) * 10) / 10;

    return {
      ...team,
      rank: 0,
      expectedWins,
      luck: Math.round((actualWins - expectedWins) * 100) / 100,
      powerScore,
    };
  });

  ranked.sort((a, b) => b.powerScore - a.powerScore || b.pointsFor - a.pointsFor);
  ranked.forEach((t, i) => (t.rank = i + 1));
  return ranked;
}

// ── Matchup simulation ───────────────────────────────────────────────────────

export interface SimPlayer {
  projectedPoints: number;
  floor: number;
  ceiling: number;
}

export interface MatchupOdds {
  /** Probability side A wins, 0..1. */
  winProbability: number;
  /** Median simulated score for each side. */
  medianA: number;
  medianB: number;
  iterations: number;
}

/**
 * Simulates a head-to-head by sampling every starter independently.
 *
 * Each player's spread becomes a standard deviation: floor and ceiling are the
 * 20th and 80th percentiles, which span about 1.68 standard deviations.
 */
export function simulateMatchup(
  lineupA: SimPlayer[],
  lineupB: SimPlayer[],
  options: { iterations?: number; seed?: number } = {},
): MatchupOdds {
  const iterations = options.iterations ?? 5000;
  const rng = createRng(options.seed ?? 42);

  const sigma = (p: SimPlayer) => Math.max(0.5, (p.ceiling - p.floor) / 1.68);

  let winsA = 0;
  const totalsA: number[] = [];
  const totalsB: number[] = [];

  for (let i = 0; i < iterations; i++) {
    let a = 0;
    let b = 0;
    for (const p of lineupA) a += Math.max(0, sampleNormal(rng, p.projectedPoints, sigma(p)));
    for (const p of lineupB) b += Math.max(0, sampleNormal(rng, p.projectedPoints, sigma(p)));
    if (a > b) winsA++;
    totalsA.push(a);
    totalsB.push(b);
  }

  const median = (xs: number[]) => {
    const sorted = [...xs].sort((x, y) => x - y);
    return Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100;
  };

  return {
    winProbability: Math.round((winsA / iterations) * 1000) / 1000,
    medianA: median(totalsA),
    medianB: median(totalsB),
    iterations,
  };
}

// ── Playoff odds ─────────────────────────────────────────────────────────────

export interface RemainingGame {
  week: number;
  homeTeamId: string;
  awayTeamId: string;
}

export interface PlayoffInput {
  teams: TeamRecord[];
  remaining: RemainingGame[];
  /** How many teams make the playoffs. */
  playoffSpots: number;
  /** Per-game win probability between two teams; defaults to scoring rates. */
  seed?: number;
  iterations?: number;
}

/**
 * Monte Carlo over the remaining schedule.
 *
 * Each remaining game is decided by the two teams' scoring rates rather than a
 * coin flip, so a strong team with a hard schedule still comes out ahead.
 */
export function playoffOdds(input: PlayoffInput): Record<string, number> {
  const iterations = input.iterations ?? 2000;
  const rng = createRng(input.seed ?? 7);

  const played = (t: TeamRecord) => Math.max(t.wins + t.losses + t.ties, 1);
  const rate = new Map(input.teams.map((t) => [t.teamId, t.pointsFor / played(t)]));
  const madeCount = new Map(input.teams.map((t) => [t.teamId, 0]));

  for (let i = 0; i < iterations; i++) {
    const wins = new Map(input.teams.map((t) => [t.teamId, t.wins + t.ties * 0.5]));

    for (const game of input.remaining) {
      const a = rate.get(game.homeTeamId) ?? 1;
      const b = rate.get(game.awayTeamId) ?? 1;
      // Bradley–Terry style: stronger scoring rate wins proportionally more.
      const pHome = a + b > 0 ? a / (a + b) : 0.5;
      const winner = rng() < pHome ? game.homeTeamId : game.awayTeamId;
      wins.set(winner, (wins.get(winner) ?? 0) + 1);
    }

    const standings = [...wins.entries()].sort(
      (x, y) => y[1] - x[1] || (rate.get(y[0]) ?? 0) - (rate.get(x[0]) ?? 0),
    );
    for (const [teamId] of standings.slice(0, input.playoffSpots)) {
      madeCount.set(teamId, (madeCount.get(teamId) ?? 0) + 1);
    }
  }

  const out: Record<string, number> = {};
  for (const [teamId, count] of madeCount) {
    out[teamId] = Math.round((count / iterations) * 1000) / 1000;
  }
  return out;
}
