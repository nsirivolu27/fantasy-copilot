import { prisma } from "@/lib/db";
import { sleeperGet } from "./client";
import { normalizePlayer } from "./normalize";
import type { NormalizedPlayer } from "../types";

/**
 * Sleeper's full player dictionary is ~5MB. Sleeper explicitly asks callers to
 * fetch it at most once per day, so we cache it in the Player table and gate
 * refreshes on PlayerCacheMeta.fetchedAt.
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_ID = "sleeper-nfl";

export async function isPlayerCacheFresh(): Promise<boolean> {
  const meta = await prisma.playerCacheMeta.findUnique({ where: { id: CACHE_ID } });
  if (!meta) return false;
  return Date.now() - meta.fetchedAt.getTime() < ONE_DAY_MS;
}

/**
 * Refreshes the player dictionary if it's stale.
 * Returns how many players were written, or null if the cache was already fresh.
 *
 * This must never block the core league sync — the caller catches its errors
 * and continues, and the UI falls back to showing player IDs.
 */
export async function refreshPlayerCache(force = false): Promise<number | null> {
  if (!force && (await isPlayerCacheFresh())) return null;

  const dict = await sleeperGet<Record<string, unknown>>("/players/nfl", { timeoutMs: 60_000 });
  const entries = Object.entries(dict ?? {});
  if (entries.length === 0) return 0;

  // Only keep players who could plausibly be rostered. The raw dictionary
  // includes thousands of inactive practice-squad entries.
  const KEEP_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);
  const rows: NormalizedPlayer[] = [];
  for (const [id, raw] of entries) {
    const p = normalizePlayer(id, raw);
    if (p.position && KEEP_POSITIONS.has(p.position)) rows.push(p);
  }

  await upsertPlayers(rows);
  await prisma.playerCacheMeta.upsert({
    where: { id: CACHE_ID },
    create: { id: CACHE_ID, fetchedAt: new Date(), playerCount: rows.length },
    update: { fetchedAt: new Date(), playerCount: rows.length },
  });

  return rows.length;
}

/** Writes players in chunks so SQLite doesn't choke on one giant transaction. */
export async function upsertPlayers(players: NormalizedPlayer[]): Promise<void> {
  const CHUNK = 200;
  for (let i = 0; i < players.length; i += CHUNK) {
    const chunk = players.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((p) =>
        prisma.player.upsert({
          where: { sleeperId: p.platformPlayerId },
          create: {
            sleeperId: p.platformPlayerId,
            gsisId: p.gsisId,
            platformIdsJson: JSON.stringify({ sleeper: p.platformPlayerId }),
            fullName: p.fullName,
            position: p.position,
            nflTeam: p.nflTeam,
            age: p.age,
            yearsExp: p.yearsExp,
            injuryStatus: p.injuryStatus,
            injuryNote: p.injuryNote,
          },
          update: {
            gsisId: p.gsisId,
            fullName: p.fullName,
            position: p.position,
            nflTeam: p.nflTeam,
            age: p.age,
            yearsExp: p.yearsExp,
            injuryStatus: p.injuryStatus,
            injuryNote: p.injuryNote,
          },
        }),
      ),
    );
  }
}
