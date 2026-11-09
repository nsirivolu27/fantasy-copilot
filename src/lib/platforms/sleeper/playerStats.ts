import { z } from "zod";

const rowsSchema = z.array(z.object({
  player_id: z.string(), season: z.string(), week: z.number().int(),
  season_type: z.literal("regular"), stats: z.record(z.number().finite()),
  team: z.string().nullish(), opponent: z.string().nullish(),
  date: z.string().nullish(), updated_at: z.number().nullish(),
}));
export type PlayerStatRow = z.infer<typeof rowsSchema>[number];
export type WeeklyPlayerData = {
  stats: Record<string, PlayerStatRow>; projections: Record<string, PlayerStatRow>;
  warnings: string[]; fetchedAt: string;
};

/** These public feeds are verified against live responses but are not part of
 * Sleeper's supported v1 documentation. Failure must never hide league scores. */
export async function readWeeklyPlayerData(season: string, week: number): Promise<WeeklyPlayerData> {
  if (!/^\d{4}$/.test(season) || !Number.isInteger(week) || week < 1 || week > 18) {
    return { stats: {}, projections: {}, warnings: ["Choose a scoring week to load player statistics."], fetchedAt: new Date().toISOString() };
  }
  const read = async (kind: "stats" | "projections") => {
    const response = await fetch(`https://api.sleeper.com/${kind}/nfl/${season}/${week}?season_type=regular`, {
      credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`${kind} unavailable`);
    return normalizeWeeklyPlayerRows(await response.json(), season, week);
  };
  const [stats, projections] = await Promise.allSettled([read("stats"), read("projections")]);
  return {
    stats: stats.status === "fulfilled" ? stats.value : {},
    projections: projections.status === "fulfilled" ? projections.value : {},
    warnings: [stats.status === "rejected" ? "Sleeper player statistics are unavailable." : "", projections.status === "rejected" ? "Sleeper projections are unavailable." : ""].filter(Boolean),
    fetchedAt: new Date().toISOString(),
  };
}

export function normalizeWeeklyPlayerRows(raw: unknown, season: string, week: number) {
  const rows = rowsSchema.parse(raw);
  if (rows.some(row => row.season !== season || row.week !== week)) throw new Error("Player feed returned another scoring week.");
  if (new Set(rows.map(row => row.player_id)).size !== rows.length) throw new Error("Player feed returned duplicate players.");
  return Object.fromEntries(rows.map(row => [row.player_id, row]));
}
