// Zero-dependency helpers, split out so they can be unit-tested without
// pulling in Prisma, Next, or zod. normalize.ts is the only caller.

export interface PureSlot {
  code: string;
  index: number;
  isStarter: boolean;
}

export interface PureSpot {
  platformPlayerId: string;
  slot: string;
  slotIndex?: number;
  isStarter: boolean;
}

/** Slot codes that sit outside the starting lineup. */
export const NON_STARTER_SLOTS = new Set(["BN", "IR", "TAXI"]);

export function normalizeSlots(rosterPositions: string[]): PureSlot[] {
  return rosterPositions.map((code, index) => ({
    code,
    index,
    isStarter: !NON_STARTER_SLOTS.has(code),
  }));
}

/**
 * Sleeper splits points into whole and hundredths: (112, 45) => 112.45.
 * Missing or non-numeric input becomes 0 rather than NaN.
 */
export function combinePoints(whole: unknown, decimal: unknown): number {
  const w = Number(whole ?? 0);
  const d = Number(decimal ?? 0);
  const safeW = Number.isFinite(w) ? w : 0;
  const safeD = Number.isFinite(d) ? d : 0;
  return Math.round((safeW + safeD / 100) * 100) / 100;
}

/**
 * Maps a Sleeper roster onto slots.
 *
 * Sleeper guarantees starters[] is in lineup order, so starters[i] occupies
 * the i-th starting slot. Empty slots are the string "0" and are dropped.
 * Everyone in players[] who isn't a starter lands on BN, IR or TAXI.
 */
export function assignRosterSpots(
  roster: {
    players?: string[] | null;
    starters?: string[] | null;
    reserve?: string[] | null;
    taxi?: string[] | null;
  },
  slots: PureSlot[],
): PureSpot[] {
  const starterSlots = slots.filter((s) => s.isStarter);
  const starters = (roster.starters ?? []).filter((id) => id && id !== "0");
  const all = (roster.players ?? []).filter((id) => id && id !== "0");
  const reserve = new Set((roster.reserve ?? []).filter(Boolean));
  const taxi = new Set((roster.taxi ?? []).filter(Boolean));

  const starterIds = new Set(starters);
  const spots: PureSpot[] = [];

  starters.forEach((playerId, i) => {
    const slot = starterSlots[i];
    spots.push({
      platformPlayerId: playerId,
      slot: slot?.code ?? "FLEX",
      slotIndex: slot?.index ?? i,
      isStarter: true,
    });
  });

  for (const playerId of all) {
    if (starterIds.has(playerId)) continue;
    spots.push({
      platformPlayerId: playerId,
      slot: reserve.has(playerId) ? "IR" : taxi.has(playerId) ? "TAXI" : "BN",
      isStarter: false,
    });
  }

  return spots;
}

/** Team name precedence: user metadata -> manager handle -> generic label. */
export function pickTeamName(
  metadataTeamName: unknown,
  displayName: unknown,
  rosterId: string | number,
): string {
  const meta = typeof metadataTeamName === "string" ? metadataTeamName.trim() : "";
  if (meta) return meta;
  const handle = typeof displayName === "string" ? displayName.trim() : "";
  if (handle) return handle;
  return `Team ${rosterId}`;
}

/** Sleeper league settings.type: 0 redraft, 1 keeper, 2 dynasty. */
export function readLeagueType(type: unknown): { isKeeper: boolean; isDynasty: boolean } {
  const t = Number(type ?? 0);
  return { isKeeper: t === 1, isDynasty: t === 2 };
}

/**
 * Infer the waiver system from the budget rather than guessing Sleeper's
 * waiver_type enum: a positive budget means FAAB.
 */
export function readWaiverType(waiverBudget: unknown): "faab" | "rolling" {
  const b = Number(waiverBudget ?? 0);
  return Number.isFinite(b) && b > 0 ? "faab" : "rolling";
}
