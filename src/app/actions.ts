"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { SETTING_KEYS, setSetting } from "@/lib/settings";
import { syncLeague } from "@/lib/sync/syncLeague";
import type { PlatformId } from "@/lib/platforms";

export interface SyncFormState {
  status: "idle" | "ok" | "error";
  message?: string;
  warnings?: string[];
}

/** Triggered by the Settings form. All network work stays on the server. */
export async function syncLeagueAction(
  _prev: SyncFormState,
  formData: FormData,
): Promise<SyncFormState> {
  const platform = (formData.get("platform")?.toString() ?? "sleeper") as PlatformId;
  const leagueId = formData.get("leagueId")?.toString() ?? "";

  const result = await syncLeague(platform, leagueId);

  if (!result.ok) {
    return { status: "error", message: result.error ?? "Sync failed." };
  }

  if (result.leagueId) {
    await setSetting(SETTING_KEYS.activeLeagueId, result.leagueId);
  }

  revalidatePath("/");
  revalidatePath("/settings");

  const parts = [
    `Synced ${result.teamCount} teams and ${result.rosterSpotCount} roster spots.`,
    result.playersRefreshed != null
      ? `Refreshed ${result.playersRefreshed} players.`
      : "Player dictionary was already fresh.",
  ];

  return { status: "ok", message: parts.join(" "), warnings: result.warnings };
}

/** Marks which synced team belongs to the user. */
export async function setMyTeamAction(formData: FormData): Promise<void> {
  const teamId = formData.get("teamId")?.toString();
  if (!teamId) return;

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return;

  await prisma.$transaction([
    prisma.team.updateMany({ where: { leagueId: team.leagueId }, data: { isMine: false } }),
    prisma.team.update({ where: { id: teamId }, data: { isMine: true } }),
  ]);

  revalidatePath("/");
  revalidatePath("/settings");
}
