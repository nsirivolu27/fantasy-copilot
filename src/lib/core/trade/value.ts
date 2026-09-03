/**
 * Player trade values, behind a provider interface.
 *
 * Same pattern as the platform adapters and the LLM layer: one interface, a
 * built-in implementation, and room for others. Users pick a provider in
 * Settings, so a league that trusts an external value chart can use it without
 * a code change.
 */

export interface ValuedPlayer {
  playerId: string;
  name: string;
  position: string;
  /** Projected points per game for the rest of the season. */
  projectedPointsPerGame?: number;
  age?: number | null;
  byeWeek?: number | null;
}

export interface PlayerValue {
  playerId: string;
  /** Higher is better. Units are provider-defined; only ratios are meaningful. */
  value: number;
  /** Where the number came from, so the UI can attribute it honestly. */
  source: string;
  /** 0..1, how much the provider trusts this number. */
  confidence: number;
}

export interface TradeValueContext {
  /** Regular-season weeks left, including the current one. */
  weeksRemaining: number;
  isDynasty: boolean;
  /** Points a freely available player at each position provides per game. */
  replacementLevel: Record<string, number>;
}

export interface TradeValueProvider {
  id: string;
  label: string;
  /** Shown in Settings so the user knows what they're trusting. */
  description: string;
  getValues(players: ValuedPlayer[], context: TradeValueContext): Promise<PlayerValue[]>;
}

export const DEFAULT_REPLACEMENT_LEVEL: Record<string, number> = {
  QB: 12,
  RB: 6,
  WR: 6,
  TE: 4,
  K: 7,
  DEF: 6,
};

/**
 * The built-in provider: rest-of-season points above replacement.
 *
 * A player is worth what he adds over what you could get for free, multiplied
 * by how long you'd have him. That makes a 15-point RB in week 2 worth far
 * more than the same RB in week 14, which is the part most static value charts
 * get wrong.
 */
export const pointsAboveReplacementProvider: TradeValueProvider = {
  id: "built-in-vor",
  label: "Built-in (points above replacement)",
  description:
    "Rest-of-season projected points above a freely available player at the same position. Derived from this app's own projections, so it respects your league's scoring.",

  async getValues(players, context) {
    return players.map((p) => {
      const perGame = p.projectedPointsPerGame ?? 0;
      const replacement = context.replacementLevel[p.position] ?? 4;
      const weeks = Math.max(0, context.weeksRemaining - (byeAhead(p, context) ? 1 : 0));
      const value = Math.max(0, (perGame - replacement) * weeks);

      return {
        playerId: p.playerId,
        value: round2(dynastyAdjust(value, p, context)),
        source: "built-in-vor",
        confidence: perGame > 0 ? 0.6 : 0.15,
      };
    });
  },
};

function byeAhead(p: ValuedPlayer, context: TradeValueContext): boolean {
  // Without a current week we can't tell; assume the bye is still to come only
  // when the season still has most of its length left.
  return p.byeWeek != null && context.weeksRemaining > 4;
}

/**
 * In dynasty, a 24-year-old and a 31-year-old with identical projections are
 * not worth the same. Redraft ignores age entirely.
 */
function dynastyAdjust(value: number, p: ValuedPlayer, context: TradeValueContext): number {
  if (!context.isDynasty || p.age == null) return value;
  const PEAK = 25;
  const perYear = p.position === "RB" ? 0.06 : 0.035; // backs age faster
  const delta = Math.max(0, p.age - PEAK);
  return value * Math.max(0.35, 1 - delta * perYear);
}

/**
 * Wraps any HTTP service that returns player values.
 *
 * There is no public API for RotoTrade or the other popular calculators, so
 * this is deliberately generic: point it at any endpoint that accepts a list
 * of player names and returns values. If a service publishes an API later,
 * it plugs in here with no changes to the trade engine.
 */
export function createHttpValueProvider(config: {
  id: string;
  label: string;
  endpoint: string;
  apiKey?: string;
  /** Reads the response body into {name -> value}. Override per service. */
  parse?: (body: unknown) => Record<string, number>;
}): TradeValueProvider {
  return {
    id: config.id,
    label: config.label,
    description: `External value source at ${config.endpoint}. Values are the provider's, not this app's.`,

    async getValues(players) {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({ players: players.map((p) => ({ name: p.name, position: p.position })) }),
      });
      if (!res.ok) throw new Error(`Value provider ${config.label} returned ${res.status}.`);

      const body = await res.json();
      const byName = config.parse ? config.parse(body) : defaultParse(body);

      return players.map((p) => {
        const value = byName[p.name];
        return {
          playerId: p.playerId,
          value: typeof value === "number" ? value : 0,
          source: config.id,
          confidence: typeof value === "number" ? 0.5 : 0,
        };
      });
    },
  };
}

/** Accepts {"Player Name": 42} or [{name, value}], the two common shapes. */
function defaultParse(body: unknown): Record<string, number> {
  if (Array.isArray(body)) {
    const out: Record<string, number> = {};
    for (const row of body) {
      const r = row as { name?: string; player?: string; value?: number };
      const name = r.name ?? r.player;
      if (name && typeof r.value === "number") out[name] = r.value;
    }
    return out;
  }
  if (body && typeof body === "object") {
    const values = (body as { values?: unknown }).values ?? body;
    if (values && typeof values === "object") return values as Record<string, number>;
  }
  return {};
}

/**
 * A value chart pasted or uploaded as CSV: "name,value" rows.
 * The realistic way to use a service that has no API.
 */
export function createCsvValueProvider(config: {
  id: string;
  label: string;
  rows: { name: string; value: number }[];
}): TradeValueProvider {
  const byName = new Map(config.rows.map((r) => [normalizeName(r.name), r.value]));
  return {
    id: config.id,
    label: config.label,
    description: `Imported value chart with ${config.rows.length} players. Values are whoever published the chart's, not this app's.`,
    async getValues(players) {
      return players.map((p) => {
        const value = byName.get(normalizeName(p.name));
        return {
          playerId: p.playerId,
          value: value ?? 0,
          source: config.id,
          confidence: value != null ? 0.5 : 0,
        };
      });
    },
  };
}

/** Lowercase, strip punctuation and suffixes so "A.J. Brown Jr." matches "AJ Brown". */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
