"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { SETTING_KEYS, setSetting } from "@/lib/settings";
import { syncLeague } from "@/lib/sync/syncLeague";
import { chat } from "@/lib/llm/providers";
import { invalidateLeagueIndex } from "@/lib/rag";
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
    // Rosters just changed — drop the cached retrieval index.
    invalidateLeagueIndex(result.leagueId);
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

// ─── LLM providers ───────────────────────────────────────────────────────────

export async function saveProviderAction(formData: FormData): Promise<void> {
  const label = formData.get("label")?.toString().trim() ?? "";
  const baseUrl = formData.get("baseUrl")?.toString().trim() ?? "";
  const modelId = formData.get("modelId")?.toString().trim() ?? "";
  const kind = formData.get("kind")?.toString() ?? "openai-compatible";
  const apiKey = formData.get("apiKey")?.toString().trim() ?? "";

  if (!label || !baseUrl || !modelId) return;

  const created = await prisma.llmProvider.create({
    data: { label, baseUrl, modelId, kind, apiKey: apiKey || null },
  });

  // First provider added becomes the default.
  const count = await prisma.llmProvider.count();
  if (count === 1) {
    await prisma.llmProvider.update({ where: { id: created.id }, data: { isDefault: true } });
  }

  revalidatePath("/settings");
  revalidatePath("/chat");
}

export async function setDefaultProviderAction(formData: FormData): Promise<void> {
  const id = formData.get("providerId")?.toString();
  if (!id) return;
  await prisma.$transaction([
    prisma.llmProvider.updateMany({ data: { isDefault: false } }),
    prisma.llmProvider.update({ where: { id }, data: { isDefault: true } }),
  ]);
  revalidatePath("/settings");
  revalidatePath("/chat");
}

export async function deleteProviderAction(formData: FormData): Promise<void> {
  const id = formData.get("providerId")?.toString();
  if (!id) return;
  await prisma.llmProvider.delete({ where: { id } });
  revalidatePath("/settings");
  revalidatePath("/chat");
}

/** Sends one trivial prompt and records whether the provider answered. */
export async function testProviderAction(formData: FormData): Promise<void> {
  const id = formData.get("providerId")?.toString();
  if (!id) return;
  const row = await prisma.llmProvider.findUnique({ where: { id } });
  if (!row) return;

  const startedAt = Date.now();
  let ok = false;
  let note = "";
  try {
    const result = await chat(
      {
        id: row.id,
        label: row.label,
        kind: row.kind as "openai-compatible" | "anthropic",
        baseUrl: row.baseUrl,
        apiKey: row.apiKey,
        modelId: row.modelId,
        supportsTools: false,
      },
      [{ role: "user", content: "Reply with the single word: ready" }],
      [],
      { timeoutMs: 25_000 },
    );
    ok = result.text.toLowerCase().includes("ready");
    note = ok
      ? `Answered in ${Date.now() - startedAt}ms.`
      : `Connected, but the reply was unexpected: "${result.text.slice(0, 80)}"`;
  } catch (err) {
    note = err instanceof Error ? err.message : "Unknown failure.";
  }

  await prisma.llmProvider.update({
    where: { id },
    data: { lastTestedAt: new Date(), lastTestOk: ok, lastTestNote: note },
  });
  revalidatePath("/settings");
}
