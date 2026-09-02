import { prisma } from "./db";

/** Keys used by the simple key/value Setting table. */
export const SETTING_KEYS = {
  activeLeagueId: "active_league_id",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** The league currently shown in the UI, or the most recently synced one. */
export async function getActiveLeague() {
  const id = await getSetting(SETTING_KEYS.activeLeagueId);
  if (id) {
    const league = await prisma.league.findUnique({ where: { id } });
    if (league) return league;
  }
  return prisma.league.findFirst({ orderBy: { updatedAt: "desc" } });
}
