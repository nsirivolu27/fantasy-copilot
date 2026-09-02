/**
 * The trade engine: lineup optimization plus two-sided trade evaluation.
 *
 * These live together because they are one idea. A trade is judged by what it
 * does to each roster's best legal starting lineup — not by comparing player
 * values in the abstract. That is why a fourth good running back is worth
 * little to a team already starting three, and why the same trade can be a win
 * for one side and a loss for the other.
 *
 * Zero imports on purpose: pure, unit testable, and the piece both the trading
 * app and the MCP server share.
 */

export interface LineupPlayer {
  playerId: string;
  name: string;
  position: string;
  projectedPoints: number;
  /** Sleeper designation: Out, Doubtful, Questionable, IR… */
  injuryStatus?: string | null;
  /** True when this player's NFL team is on bye for the week being set. */
  isOnBye?: boolean;
  /** False when no projection exists, so advice can say so instead of guessing. */
  hasProjection?: boolean;
}

export interface LineupSlot {
  code: string;
  index: number;
}

/** Which positions each slot code accepts. Anything unlisted matches its own name. */
const SLOT_ELIGIBILITY: Record<string, string[]> = {
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  IDP_FLEX: ["DL", "LB", "DB"],
};

export function slotAccepts(slotCode: string, position: string): boolean {
  const eligible = SLOT_ELIGIBILITY[slotCode];
  if (eligible) return eligible.includes(position);
  return slotCode === position;
}

export interface LineupResult {
  assignments: { slot: string; slotIndex: number; player: LineupPlayer | null }[];
  total: number;
  benched: LineupPlayer[];
}

/**
 * Fills the lineup best-first.
 *
 * Slots are filled from most restrictive to least, which is the fix for the
 * classic FLEX bug: a naive pass down the slot list hands the best RB to the
 * FLEX and then has nobody left for RB2. Ties break on projection, then name,
 * so the same roster always produces the same lineup.
 */
export function optimizeLineup(players: LineupPlayer[], slots: LineupSlot[]): LineupResult {
  const pool = [...players].sort(
    (a, b) => b.projectedPoints - a.projectedPoints || a.name.localeCompare(b.name),
  );

  const eligibilityCount = (slot: LineupSlot) =>
    pool.filter((p) => slotAccepts(slot.code, p.position)).length;

  const ordered = [...slots].sort(
    (a, b) => eligibilityCount(a) - eligibilityCount(b) || a.index - b.index,
  );

  const used = new Set<string>();
  const filled = new Map<number, LineupPlayer | null>();

  for (const slot of ordered) {
    const pick = pool.find((p) => !used.has(p.playerId) && slotAccepts(slot.code, p.position));
    if (pick) used.add(pick.playerId);
    filled.set(slot.index, pick ?? null);
  }

  const assignments = slots.map((s) => ({
    slot: s.code,
    slotIndex: s.index,
    player: filled.get(s.index) ?? null,
  }));

  return {
    assignments,
    total: round2(assignments.reduce((sum, a) => sum + (a.player?.projectedPoints ?? 0), 0)),
    benched: pool.filter((p) => !used.has(p.playerId)),
  };
}

/** Points the best legal lineup scores — the number trades are judged against. */
export function lineupTotal(players: LineupPlayer[], slots: LineupSlot[]): number {
  return optimizeLineup(players, slots).total;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Trade evaluation ────────────────────────────────────────────────────────

interface PlayerValue {
  playerId: string;
  value: number;
}

/**
 * Two-sided trade evaluation.
 *
 * The core idea: a trade is judged by what it does to each roster's best legal
 * starting lineup, not by comparing player values in the abstract. That is why
 * a fourth good running back is worth little to a team already starting three,
 * and why the same player can be a win for one side and a loss for the other.
 *
 * Pure and dependency-free.
 */

export interface TradeSide {
  teamId: string;
  teamName: string;
  /** Everyone currently on the roster. */
  roster: LineupPlayer[];
  /** Players this side is giving away. */
  sending: string[];
}

export interface TradeInput {
  sideA: TradeSide;
  sideB: TradeSide;
  slots: LineupSlot[];
  /** Optional market values, used as a sanity check against the lineup math. */
  values?: PlayerValue[];
  /** Weeks left, so a lineup gain can be expressed over the rest of the season. */
  weeksRemaining?: number;
}

export type Verdict = "accept" | "lean_accept" | "fair" | "lean_decline" | "decline";

export interface SideResult {
  teamId: string;
  teamName: string;
  lineupBefore: number;
  lineupAfter: number;
  /** Weekly starting-lineup points gained or lost. */
  weeklyDelta: number;
  /** Weekly delta projected across the remaining season. */
  seasonDelta: number;
  valueSent: number | null;
  valueReceived: number | null;
  gives: string[];
  gets: string[];
}

export interface TradeEvaluation {
  sideA: SideResult;
  sideB: SideResult;
  /** Verdict from the perspective of side A. */
  verdict: Verdict;
  /** True when both rosters improve — the trades that actually get accepted. */
  mutuallyBeneficial: boolean;
  reasoning: string[];
  warnings: string[];
}

/** Below this, a weekly swing is noise rather than a reason to trade. */
const NOISE_THRESHOLD = 0.75;

export function evaluateTrade(input: TradeInput): TradeEvaluation {
  const weeks = input.weeksRemaining ?? 1;
  const valueById = new Map((input.values ?? []).map((v) => [v.playerId, v.value]));
  const warnings: string[] = [];

  const aSending = pick(input.sideA.roster, input.sideA.sending, warnings, input.sideA.teamName);
  const bSending = pick(input.sideB.roster, input.sideB.sending, warnings, input.sideB.teamName);

  const sideA = evaluateSide(input.sideA, aSending, bSending, input.slots, weeks, valueById);
  const sideB = evaluateSide(input.sideB, bSending, aSending, input.slots, weeks, valueById);

  const verdict = verdictFor(sideA.weeklyDelta);
  const reasoning: string[] = [];

  reasoning.push(
    `${sideA.teamName}: starting lineup goes ${describe(sideA.weeklyDelta)} (${sideA.lineupBefore.toFixed(1)} → ${sideA.lineupAfter.toFixed(1)} per week).`,
  );
  reasoning.push(
    `${sideB.teamName}: starting lineup goes ${describe(sideB.weeklyDelta)} (${sideB.lineupBefore.toFixed(1)} → ${sideB.lineupAfter.toFixed(1)} per week).`,
  );

  const mutuallyBeneficial =
    sideA.weeklyDelta > NOISE_THRESHOLD && sideB.weeklyDelta > NOISE_THRESHOLD;

  if (mutuallyBeneficial) {
    reasoning.push(
      "Both rosters improve — complementary needs, so this is the rare trade that actually gets accepted.",
    );
  } else if (sideB.weeklyDelta < -NOISE_THRESHOLD) {
    reasoning.push(
      `${sideB.teamName} loses ${Math.abs(sideB.weeklyDelta).toFixed(1)} points a week. They have little reason to accept, however good it looks on your side.`,
    );
  }

  // Depth traded for starters is the usual reason the lineup math and a value
  // chart disagree, and the lineup math is the one that wins games.
  if (valueById.size > 0) {
    const aValueDelta = (sideA.valueReceived ?? 0) - (sideA.valueSent ?? 0);
    if (aValueDelta < 0 && sideA.weeklyDelta > NOISE_THRESHOLD) {
      reasoning.push(
        "You give up more raw trade value than you get, but your starting lineup improves — consolidating depth into a starter.",
      );
    }
    if (aValueDelta > 0 && sideA.weeklyDelta < -NOISE_THRESHOLD) {
      reasoning.push(
        "You gain trade value but your starting lineup gets worse — the pieces coming back don't crack your lineup.",
      );
    }
  }

  if (input.sideA.sending.length === 0 || input.sideB.sending.length === 0) {
    warnings.push("One side gives up nothing — this is a giveaway, not a trade.");
  }

  return { sideA, sideB, verdict, mutuallyBeneficial, reasoning, warnings };
}

function evaluateSide(
  side: TradeSide,
  sending: LineupPlayer[],
  receiving: LineupPlayer[],
  slots: LineupSlot[],
  weeks: number,
  valueById: Map<string, number>,
): SideResult {
  const before = lineupTotal(side.roster, slots);

  const sentIds = new Set(sending.map((p) => p.playerId));
  const after = lineupTotal(
    [...side.roster.filter((p) => !sentIds.has(p.playerId)), ...receiving],
    slots,
  );

  const weeklyDelta = round2(after - before);
  const sum = (players: LineupPlayer[]) =>
    players.reduce((total, p) => total + (valueById.get(p.playerId) ?? 0), 0);

  return {
    teamId: side.teamId,
    teamName: side.teamName,
    lineupBefore: before,
    lineupAfter: after,
    weeklyDelta,
    seasonDelta: round2(weeklyDelta * weeks),
    valueSent: valueById.size ? round2(sum(sending)) : null,
    valueReceived: valueById.size ? round2(sum(receiving)) : null,
    gives: sending.map((p) => p.name),
    gets: receiving.map((p) => p.name),
  };
}

function pick(
  roster: LineupPlayer[],
  ids: string[],
  warnings: string[],
  teamName: string,
): LineupPlayer[] {
  const byId = new Map(roster.map((p) => [p.playerId, p]));
  const found: LineupPlayer[] = [];
  for (const id of ids) {
    const player = byId.get(id);
    if (player) found.push(player);
    else warnings.push(`${teamName} doesn't roster player ${id}; it was ignored.`);
  }
  return found;
}

export function verdictFor(weeklyDelta: number): Verdict {
  if (weeklyDelta >= 3) return "accept";
  if (weeklyDelta >= NOISE_THRESHOLD) return "lean_accept";
  if (weeklyDelta > -NOISE_THRESHOLD) return "fair";
  if (weeklyDelta > -3) return "lean_decline";
  return "decline";
}

function describe(delta: number): string {
  if (Math.abs(delta) < NOISE_THRESHOLD) return "essentially unchanged";
  return delta > 0 ? `up ${delta.toFixed(1)}` : `down ${Math.abs(delta).toFixed(1)}`;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  accept: "Accept",
  lean_accept: "Lean accept",
  fair: "Fair",
  lean_decline: "Lean decline",
  decline: "Decline",
};

// ── Start/sit advice ────────────────────────────────────────────────────────

/** A gap smaller than this is noise, not a recommendation. */
export const COIN_FLIP_THRESHOLD = 1.5;

const CANNOT_PLAY = new Set(["OUT", "IR", "PUP", "SUSP", "DOUBTFUL", "NA"]);

export interface LineupChange {
  slot: string;
  slotIndex: number;
  out: LineupPlayer | null;
  in: LineupPlayer;
  /** Points gained at this slot. */
  gain: number;
  /** True when the gap is small enough that either choice is defensible. */
  isCoinFlip: boolean;
  reason: string;
}

export interface LineupAlert {
  severity: "critical" | "warning";
  message: string;
  playerId?: string;
}

export interface LineupAdvice {
  currentTotal: number;
  optimalTotal: number;
  pointsGained: number;
  changes: LineupChange[];
  alerts: LineupAlert[];
  optimal: LineupResult;
}

/**
 * Compares the lineup as it stands against the optimal one.
 *
 * Two deliberate choices. Players who cannot play are removed from the pool
 * before optimizing, so the optimizer never recommends starting someone who is
 * Out. And a swap worth less than COIN_FLIP_THRESHOLD is labelled a coin flip
 * rather than dressed up as a recommendation — most start/sit calls genuinely
 * are close, and pretending otherwise is how a tool loses trust.
 */
export function adviseLineup(args: {
  roster: LineupPlayer[];
  currentStarterIds: string[];
  slots: LineupSlot[];
}): LineupAdvice {
  const { roster, slots } = args;
  const currentIds = new Set(args.currentStarterIds);
  const byId = new Map(roster.map((p) => [p.playerId, p]));

  const alerts: LineupAlert[] = [];

  // Current lineup: whoever is actually starting, in their slots.
  const currentStarters = args.currentStarterIds
    .map((id) => byId.get(id))
    .filter((p): p is LineupPlayer => p != null);
  const currentTotal = round2(
    currentStarters.reduce((sum, p) => sum + p.projectedPoints, 0),
  );

  for (const p of currentStarters) {
    if (p.isOnBye) {
      alerts.push({ severity: "critical", message: `${p.name} is on bye and is in your starting lineup.`, playerId: p.playerId });
    } else if (p.injuryStatus && CANNOT_PLAY.has(p.injuryStatus.toUpperCase())) {
      alerts.push({ severity: "critical", message: `${p.name} is listed ${p.injuryStatus} and is starting.`, playerId: p.playerId });
    } else if (p.injuryStatus) {
      alerts.push({ severity: "warning", message: `${p.name} is listed ${p.injuryStatus}.`, playerId: p.playerId });
    }
    if (p.hasProjection === false) {
      alerts.push({ severity: "warning", message: `No projection for ${p.name}, so the optimizer can't rank him.`, playerId: p.playerId });
    }
  }

  const filled = currentStarters.length;
  if (filled < slots.length) {
    alerts.push({
      severity: "critical",
      message: `${slots.length - filled} starting slot${slots.length - filled > 1 ? "s are" : " is"} empty.`,
    });
  }

  // Anyone who cannot play is excluded from the optimizer's pool entirely.
  const available = roster.filter(
    (p) => !p.isOnBye && !(p.injuryStatus && CANNOT_PLAY.has(p.injuryStatus.toUpperCase())),
  );
  const optimal = optimizeLineup(available, slots);

  const currentBySlot = new Map<number, LineupPlayer | null>();
  slots.forEach((slot, i) => currentBySlot.set(slot.index, currentStarters[i] ?? null));

  const changes: LineupChange[] = [];
  for (const assignment of optimal.assignments) {
    const suggested = assignment.player;
    if (!suggested) continue;
    const existing = currentBySlot.get(assignment.slotIndex) ?? null;
    if (existing && existing.playerId === suggested.playerId) continue;
    if (currentIds.has(suggested.playerId) && existing && currentIds.has(existing.playerId)) {
      // Both already start; this is a shuffle between slots, not a real change.
      continue;
    }

    const gain = round2(suggested.projectedPoints - (existing?.projectedPoints ?? 0));
    const isCoinFlip = Math.abs(gain) < COIN_FLIP_THRESHOLD && existing != null;

    changes.push({
      slot: assignment.slot,
      slotIndex: assignment.slotIndex,
      out: existing,
      in: suggested,
      gain,
      isCoinFlip,
      reason: buildReason(suggested, existing, gain, isCoinFlip),
    });
  }

  changes.sort((a, b) => b.gain - a.gain);

  return {
    currentTotal,
    optimalTotal: optimal.total,
    pointsGained: round2(optimal.total - currentTotal),
    changes,
    alerts,
    optimal,
  };
}

function buildReason(
  incoming: LineupPlayer,
  outgoing: LineupPlayer | null,
  gain: number,
  isCoinFlip: boolean,
): string {
  if (!outgoing) return `${incoming.name} fills an empty slot (${incoming.projectedPoints.toFixed(1)} projected).`;
  if (outgoing.isOnBye) return `${outgoing.name} is on bye; ${incoming.name} projects ${incoming.projectedPoints.toFixed(1)}.`;
  if (outgoing.injuryStatus && CANNOT_PLAY.has(outgoing.injuryStatus.toUpperCase())) {
    return `${outgoing.name} is ${outgoing.injuryStatus}; ${incoming.name} projects ${incoming.projectedPoints.toFixed(1)}.`;
  }
  if (isCoinFlip) {
    return `Coin flip — ${gain.toFixed(1)} points between them. Either is defensible.`;
  }
  return `${incoming.name} projects ${gain.toFixed(1)} more than ${outgoing.name}.`;
}
