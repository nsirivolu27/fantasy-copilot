# Integrations

Fantasy Copilot is built to sit at the centre of three apps:

1. **Fantasy Copilot** — league sync, projections, decision tools. This repo.
2. **The trade marketplace** — where managers propose, browse and negotiate trades. Separate app, already mostly built.
3. **A trade analyzer** — player values. Either ours, or an external service.

Rather than merge them, the boundaries are explicit and layered, so each can ship on its own schedule.

---

## The three layers

```
┌─────────────────────────────────────────────────────────┐
│  src/lib/core/         pure domain, zero dependencies    │  ← share by import
│  lineup + trade engine, projections, scoring, retrieval  │
└─────────────────────────────────────────────────────────┘
             ▲                    ▲                    ▲
             │                    │                    │
┌────────────┴───────┐  ┌─────────┴────────┐  ┌────────┴─────────┐
│  This app (UI+DB)  │  │  REST  /api/v1   │  │  MCP  /api/mcp   │  ← share by call
└────────────────────┘  └──────────────────┘  └──────────────────┘
```

**Layer 1 — the core package.** Everything under `src/lib/core/` is pure: no Prisma, no Next, no React, no network, and no npm dependencies at all. The trade engine, the projection model, the scoring function and the retrieval index all live there. That purity isn't a convention — `scripts/test-boundaries.mjs` fails the build if a core module imports the database or the framework.

The trading app can consume this layer three ways, cheapest first:

- **Copy the files.** They have no dependencies; `engine.ts` and `value.ts` drop into any TypeScript project as-is.
- **Extract to a package.** Move `src/lib/core/` to `packages/core`, publish as `@fantasy-copilot/core`, add a workspace. The boundary test already guarantees nothing else has to move with it.
- **Call the API instead.** If the trading app isn't TypeScript, use layer 2.

**Layer 2 — REST.** A versioned public API at `/api/v1`, authenticated with API keys, with outbound webhooks so the trading app doesn't poll. Language-agnostic; the two apps deploy independently.

**Layer 3 — MCP.** The same tool registry the in-app chat uses, exposed over the Model Context Protocol at `/api/mcp`. For anything AI-driven — Claude Desktop, Cursor, or an agent inside the trading app.

**All three read the same registry.** `src/lib/tools/registry.ts` defines each capability exactly once. The chat route converts it to the model's function-calling format; the MCP route loops the same array. Adding a tool adds it everywhere. There is no second list, and a PR that creates one will be sent back.

---

## REST API

### Authentication

Create a key in **Settings → Integrations**. It's shown once and stored only as a SHA-256 hash, so a database leak doesn't hand over working credentials.

```
Authorization: Bearer fcp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Scopes: `read:league`, `read:projections`, `read:trades`, `write:trades`. Give the trading app the narrowest set it needs — a read-only integration should never hold `write:trades`.

Every response has the same shape:

```json
{ "ok": true, "version": "v1", "data": ..., "meta": { ... } }
{ "ok": false, "version": "v1", "error": "...", "hint": "..." }
```

### Endpoints

| Method | Path | Scope | Returns |
|---|---|---|---|
| GET | `/api/v1/league` | `read:league` | Settings, scoring, roster slots, sync status |
| GET | `/api/v1/teams` | `read:league` | Standings, records, FAAB remaining |
| GET | `/api/v1/teams?include=roster` | `read:league` | The above plus every roster with projections |
| GET | `/api/v1/projections?week=N` | `read:projections` | Projections with floor, ceiling, confidence, reasoning |
| POST | `/api/v1/trades/evaluate` | `read:trades` | Two-sided verdict for a hypothetical. Records nothing |
| GET | `/api/v1/trades/suggest?teamId=` | `read:trades` | One-for-one swaps that improve **both** rosters |
| GET | `/api/v1/trades?status=` | `read:trades` | Recorded proposals |
| POST | `/api/v1/trades` | `write:trades` | Record a proposal (idempotent on `externalId`) |
| GET | `/api/v1/trade-block` | `read:trades` | Who is advertising what |
| POST | `/api/v1/trade-block` | `write:trades` | Add or update an entry |
| DELETE | `/api/v1/trade-block?id=` | `write:trades` | Remove one |
| GET | `/api/health` | none | Liveness and database check |

### Evaluating a trade

```bash
curl -X POST https://your-app/api/v1/trades/evaluate \
  -H "Authorization: Bearer $FC_KEY" \
  -H "content-type: application/json" \
  -d '{
    "fromTeamId": "clx…", "toTeamId": "cly…",
    "fromPlayerIds": ["p1"], "toPlayerIds": ["p2"]
  }'
```

The response scores **each side separately**:

```json
{ "ok": true, "data": {
  "sideA": { "teamName": "tech rejects", "lineupBefore": 111.0, "lineupAfter": 124.0,
             "weeklyDelta": 13.0, "seasonDelta": 130.0, "gives": ["WR Two"], "gets": ["WR Three"] },
  "sideB": { "teamName": "jeet", "weeklyDelta": -4.0, "…": "…" },
  "verdict": "accept", "verdictLabel": "Accept",
  "mutuallyBeneficial": false,
  "reasoning": ["…"], "warnings": []
}}
```

### Recording proposals idempotently

`POST /api/v1/trades` upserts on `externalId` within a league, so the trading app can safely retry a failed call, and reconcile using its own ids. Post the same proposal twice and you update it rather than duplicating it.

---

## Webhooks

Register a subscription in Settings. Events fire on a background path and never block the action that caused them — an unreachable subscriber cannot fail a league sync.

| Event | Fires when |
|---|---|
| `league.synced` | A sync completes |
| `projections.updated` | A projection run finishes |
| `trade.proposed` | A proposal is created or updated |
| `trade.status_changed` | A proposal's status changes |
| `trade_block.updated` | Trade block entry added or removed |

Each delivery carries:

```
x-fantasy-copilot-event: trade.proposed
x-fantasy-copilot-signature: sha256=<hmac of the raw body, using your subscription secret>
```

Verify it before trusting the payload:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody: string, header: string, secret: string) {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

A subscription that fails 20 times in a row is deactivated rather than retried forever.

---

## MCP

`/api/mcp` speaks Streamable HTTP and authenticates with the same API keys.

```json
{
  "mcpServers": {
    "fantasy-copilot": {
      "url": "https://your-app/api/mcp",
      "headers": { "Authorization": "Bearer fcp_…" }
    }
  }
}
```

Nine read-only tools: `get_league_info`, `list_teams`, `get_roster`, `find_player`, `get_projections`, `optimal_lineup`, `evaluate_trade`, `find_trades`, `search_league`.

**Every tool is read-only, deliberately.** Nothing over MCP can submit a waiver claim, drop a player or send a trade offer. Write actions belong behind an explicit human confirmation, never an autonomous tool call. `write:trades` exists for the REST API, where a person clicked something.

---

## Trade value providers

Player values sit behind an interface, the same pattern as the platform adapters and the LLM layer:

```ts
interface TradeValueProvider {
  id: string;
  label: string;
  description: string;
  getValues(players: ValuedPlayer[], context: TradeValueContext): Promise<PlayerValue[]>;
}
```

Three implementations ship:

- **`built-in-vor`** (default) — rest-of-season projected points above a freely available player at the same position, scaled by weeks remaining, with an age curve in dynasty. Derived from this app's own projections, so it respects your league's scoring. A 15-point RB in week 2 is worth far more than the same RB in week 14 — the part most static value charts get wrong.
- **`http`** — points at any endpoint that takes player names and returns values.
- **`csv`** — an imported value chart, `name,value` rows. Names are normalized, so "A.J. Brown Jr." matches "AJ Brown".

### On RotoTrade and similar services

**RotoTrade publishes no public API**, and neither do the other popular trade calculators — no developer docs, no keys, no documented export. So there is no `RotoTradeProvider` in this repo, because writing one would mean inventing an API that doesn't exist.

The `http` and `csv` providers are the honest path:

- If a service exposes an API later, point the `http` provider at it — no changes to the trade engine.
- Until then, export or paste a value chart and load it through the `csv` provider.

Whichever provider is active, the UI attributes the number to its source. Values from an external chart are labelled as that chart's opinion, not this app's.

### A note on what values are for

The trade engine's verdict comes from **lineup math**, not from values: a trade is judged by how much each roster's best legal starting lineup changes. Values are a cross-check, and the interesting case is when they disagree — giving up more raw value while your lineup improves usually means consolidating depth into a starter, which is a good trade that most value calculators score as a loss.

That distinction is why a fourth good running back is worth almost nothing to a team already starting three, and why the same trade can genuinely help both sides.

---

## Suggested split of responsibilities

| Concern | Owner |
|---|---|
| League sync, rosters, scoring | Fantasy Copilot |
| Projections and player values | Fantasy Copilot (`core`) |
| Trade evaluation | Fantasy Copilot (`core`) |
| Proposal lifecycle, negotiation, notifications, chat between managers | Trade marketplace |
| Identity and league membership | Whichever app already owns it — don't build it twice |

Rule of thumb: **anything that computes a number about football belongs in `core`; anything about people talking to each other belongs in the marketplace.**

---

## Adding a fourth app later

The same three layers apply. Concretely:

1. Add tools to `src/lib/tools/registry.ts` — chat and MCP pick them up automatically.
2. Add REST routes under `src/app/api/v1/` using `authenticate()` and the `ok()` / `fail()` helpers.
3. Put any real logic in `src/lib/core/` so it stays testable and shareable, and keep it dependency-free — the boundary test will tell you if you slip.
