/** Sleeper stat keys match scoring keys. Never use a preset PPR total. */
export function scoreSleeperProjection(stats: Record<string, number>, scoring: Record<string, number>, position?: string) {
  let points = 0;
  const unavailableKeys: string[] = [];
  for (const [key, weight] of Object.entries(scoring)) {
    if (!weight) continue;
    if (/^(pts_allow_|yds_allow_)/.test(key) && position !== "DEF") continue;
    if (key === "bonus_rec_te" && position !== "TE") continue;
    if (key === "bonus_rush_td_qb" && position !== "QB") continue;
    // Missing ordinary counting stats mean no projected event. A missing bonus
    // or threshold cannot be inferred from an average stat line.
    const bucketFamily = key.startsWith("pts_allow_") ? "pts_allow_" : key.startsWith("yds_allow_") ? "yds_allow_" : null;
    const hasBuckets = bucketFamily !== null && Object.keys(stats).some(stat => stat.startsWith(bucketFamily));
    if (!(key in stats) && /^(bonus_|pts_allow_|yds_allow_)/.test(key) && !hasBuckets) {
      unavailableKeys.push(key);
      continue;
    }
    points += (stats[key] ?? 0) * weight;
  }
  return { points: Math.round(points * 100) / 100, unavailableKeys };
}
