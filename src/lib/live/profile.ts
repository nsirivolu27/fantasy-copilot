import { z } from "zod";

/** Portable preferences contain public league identifiers, never credentials. */
export const DashboardProfileSchema = z.object({
  version: z.literal(1),
  platform: z.literal("sleeper"),
  leagueId: z.string().regex(/^\d{10,25}$/),
  name: z.string().min(1).max(100),
  teamIds: z.array(z.string().regex(/^\d+$/)).max(100).transform(ids => [...new Set(ids)]),
});
export type DashboardProfile = z.infer<typeof DashboardProfileSchema>;
export const PROFILE_STORAGE = "fantasy-copilot-dashboards-v1";

export function parseProfiles(raw: string | null): DashboardProfile[] {
  if (!raw) return [];
  try { return z.array(DashboardProfileSchema).parse(JSON.parse(raw)); } catch { return []; }
}

export function shareQuery(profile: DashboardProfile, week = "") {
  const query = new URLSearchParams({ league: profile.leagueId, teams: profile.teamIds.join(",") });
  if (week) query.set("week", week);
  return query.toString();
}

export function parseTeamSelection(raw: string | null): string[] | null {
  if (raw === null) return null;
  if (raw === "") return [];
  const ids = raw.split(",");
  if (ids.length > 100 || ids.some(id => !/^\d+$/.test(id))) throw new Error("The shared team selection is invalid.");
  return [...new Set(ids)];
}

export function safeAppUrl(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch { return null; }
}
