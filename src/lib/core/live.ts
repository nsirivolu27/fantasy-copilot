/** A display bar for nonnegative score totals, never a win probability. */
export function scoreShare(points: number, opponentPoints: number) {
  if (!Number.isFinite(points) || !Number.isFinite(opponentPoints) || points < 0 || opponentPoints < 0 || points + opponentPoints === 0) return null;
  return points / (points + opponentPoints) * 100;
}

/** Compare actual weekly scores with every other team, including tied scores. */
export function weeklyScoreboard(scores: { teamId: string; points: number }[]) {
  if (scores.some((s) => !Number.isFinite(s.points))) throw new Error("Scores must be finite.");
  if (new Set(scores.map((s) => s.teamId)).size !== scores.length) throw new Error("Duplicate team score.");
  const sorted = [...scores].sort((a, b) => b.points - a.points || a.teamId.localeCompare(b.teamId));
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length === 0 ? null : sorted.length % 2
    ? sorted[mid].points : (sorted[mid - 1].points + sorted[mid].points) / 2;
  return {
    median,
    teams: sorted.map((score) => ({
      ...score,
      rank: 1 + scores.filter((other) => other.points > score.points).length,
      wins: scores.filter((other) => other.points < score.points).length,
      losses: scores.filter((other) => other.points > score.points).length,
      ties: scores.filter((other) => other.teamId !== score.teamId && other.points === score.points).length,
      aboveMedian: median === null ? null : Math.round((score.points - median) * 100) / 100,
    })),
  };
}
