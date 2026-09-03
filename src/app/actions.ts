"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { SETTING_KEYS, setSetting } from "@/lib/settings";
import { syncLeague } from "@/lib/sync/syncLeague";
import { chat } from "@/lib/llm/providers";
import { ALL_SCOPES, generateApiKey } from "@/lib/api/auth";
import { invalidateLeagueIndex } from "@/lib/rag";
import { ingestByeWeeks, ingestSeasonStats } from "@/lib/data/ingest";
import { runProjections } from "@/lib/projections/run";
import { getActiveLeague } from "@/lib/settings";
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
    // Rosters just changed, drop the cached retrieval index.
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

// --- LLM providers -----------------------------------------------------------

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

// --- Stats + projections -----------------------------------------------------

export interface ProjectionFormState {
  status: "idle" | "ok" | "error";
  message?: string;
}

/** Pulls the season's nflverse stats, then projects every rostered player. */
export async function refreshProjectionsAction(
  _prev: ProjectionFormState,
  _formData: FormData,
): Promise<ProjectionFormState> {
  const league = await getActiveLeague();
  if (!league) return { status: "error", message: "Sync a league first." };

  try {
    const ingest = await ingestSeasonStats(league.season);

    // Bye weeks power the start/sit alerts. Best effort, a schedule fetch
    // failure must not lose the stats we just ingested.
    let byes: { teamsResolved: number; anomalies: string[] } | null = null;
    try {
      byes = await ingestByeWeeks(league.season);
    } catch (err) {
      console.warn("[projections] bye weeks unavailable:", err instanceof Error ? err.message : err);
    }

    const run = await runProjections(league.id);
    invalidateLeagueIndex(league.id);
    revalidatePath("/");
    revalidatePath("/chat");
    revalidatePath("/lineup");

    const parts = [
      `Ingested ${ingest.rowsStored} stat rows across ${ingest.weeks.length} weeks.`,
      `Projected ${run.playersProjected} players for week ${run.week} (${run.modelVersion}).`,
    ];
    if (run.skippedNoStats > 0) {
      parts.push(`${run.skippedNoStats} had no game history and used replacement level.`);
    }
    if (byes) {
      parts.push(`Bye weeks resolved for ${byes.teamsResolved} NFL teams.`);
      if (byes.anomalies.length > 0) parts.push(`Unresolved: ${byes.anomalies.join("; ")}.`);
    } else {
      parts.push("Bye weeks could not be fetched; start/sit bye alerts will be missing.");
    }
    if (run.unsupportedScoringKeys.length > 0) {
      parts.push(
        `Scoring rules not computable from skill-position data: ${run.unsupportedScoringKeys.join(", ")}.`,
      );
    }
    return { status: "ok", message: parts.join(" ") };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Projection run failed.";
    console.error("[projections]", message);
    return { status: "error", message };
  }
}

// --- API keys (MCP access) ---------------------------------------------------

export interface ApiKeyFormState {
  status: "idle" | "created" | "error";
  /** Shown exactly once. Never stored, never retrievable again. */
  plaintext?: string;
  message?: string;
}

export async function createApiKeyAction(
  _prev: ApiKeyFormState,
  formData: FormData,
): Promise<ApiKeyFormState> {
  const label = formData.get("label")?.toString().trim() || "MCP client";
  const scopes = ALL_SCOPES.filter((s) => formData.get(`scope:${s}`) === "on");
  if (scopes.length === 0) {
    return { status: "error", message: "Pick at least one scope." };
  }

  const { plaintext, hash, prefix } = generateApiKey();
  await prisma.apiKey.create({
    data: { label, hash, prefix, scopesJson: JSON.stringify(scopes) },
  });

  revalidatePath("/settings");
  return { status: "created", plaintext, message: `Key "${label}" created with ${scopes.join(", ")}.` };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const id = formData.get("keyId")?.toString();
  if (!id) return;
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/settings");
}
