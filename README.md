# Fantasy Copilot

[![CI](https://github.com/nsirivolu27/fantasy-copilot/actions/workflows/ci.yml/badge.svg)](https://github.com/nsirivolu27/fantasy-copilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

A free, self-hosted companion for your fantasy football league. Sync your league, then get
help with the decisions that actually matter: **start/sit, waivers, streaming and trades** —
each with reasoning you can read and disagree with.

Built on free, public data. **No paid APIs. No API keys. No accounts.**

- **Platform-agnostic** — Sleeper today, ESPN and manual/CSV next, everything behind one
  adapter interface so adding Yahoo is a single file.
- **Format-agnostic** — scoring rules, roster slots, team count, season and week are all
  read from your league. Half-PPR, superflex, dynasty, 10-team, 14-team: no code changes.
- **Sport-agnostic by architecture** — football is built; basketball and baseball slot in
  without touching the engine.
- **Honest about itself** — projections ship with a confidence rating, and the model's
  accuracy gets published, including the weeks it was wrong.

> **Status: Phase 1 of 13.** League sync works end to end. Projections, waivers, trades,
> chat and the MCP server are not built yet. See the roadmap below.

---

## Roadmap

| Phase | What lands | Status |
|---|---|---|
| 1 | Foundation, adapter boundary, Sleeper league sync | ✅ Done |
| 2 | nflverse ingest, player resolution, projection model | ⬜ Next |
| 3 | Start/sit optimizer, bye and injury alerts | ⬜ |
| 4 | Waiver targets, FAAB bids, streaming planner | ⬜ |
| 5 | Trade analyzer, "find me a trade" | ⬜ |
| 6 | League hub: power rankings, playoff odds, weekly digest | ⬜ |
| 7 | ESPN + manual/CSV adapters | ⬜ |
| 8 | Tool registry + configurable LLM layer (any provider) | ⬜ |
| 9 | League chatbot, grounded in tool calls | ⬜ |
| 10 | MCP server — query your league from any AI client | ⬜ |
| 11 | Decision Leverage (Δ win%) + published calibration | ⬜ |
| 12 | Fitted projection model + season learning loop | ⬜ |
| 13 | Polish | ⬜ |

### Two ideas this project is actually about

Most fantasy tools rank decisions by **projected points**. This one ranks them by
**change in win probability**. A +2.0 point lineup swap in a game you'll win 88% of the
time is worth roughly nothing; a −0.5 point swap toward a higher ceiling when you're a 25%
underdog can be worth +6%. That's the call that wins seasons, and it's what the app is
built around (Phase 11).

And it publishes its own **calibration**: when the app says it's 70% confident, is it right
70% of the time? Every recommendation is logged and graded afterward, and the curve is
public. Nobody in consumer fantasy does this. A model that admits uncertainty honestly is
more useful than one that's confidently wrong.

---

## Phase 1 — what's here now

Foundation + real Sleeper league sync. No projections, waivers, trades, chat, or MCP yet —
those are later phases, and this phase deliberately stops here.

## Run it

```bash
npm install
cp .env.example .env
npx prisma db push      # creates prisma/dev.db (SQLite, no setup required)
npm run dev             # http://localhost:3000
```

Then open **Settings**, paste your Sleeper league ID, and press **Sync league**.
The ID is the long number in your league's web URL:
`sleeper.com/leagues/`**`<this number>`**`/team`

### No league ID handy? Offline demo mode

```bash
SLEEPER_FIXTURES=1 npm run dev
```

Serves the JSON in `fixtures/` instead of calling Sleeper, so the whole sync-and-render
flow works with no network. Use league ID `1124839284756483920` on the Settings page.

### Tests

```bash
node --experimental-strip-types scripts/test-normalize.mjs
```

Ten checks on the logic most likely to be silently wrong: lineup-slot assignment, empty
starter slots, IR/taxi separation, Sleeper's split points fields, team-name fallbacks, and
that nothing about the league format is hardcoded. No dependencies needed.

## What Phase 1 does

- Fetches the real league, users, rosters and NFL state from Sleeper (`/league/{id}`,
  `/league/{id}/rosters`, `/league/{id}/users`, `/state/nfl`). No API key, no login.
- Derives **season, current week, team count, scoring settings and roster slots from
  Sleeper** — none of them are hardcoded anywhere.
- Persists normalized rows: `League`, `Team`, `Player`, `RosterSpot`, `Setting`.
- Renders league metadata, scoring rules, roster slots, and every team with an
  expandable roster split into starters and bench/IR.
- Lets you mark which team is yours (used by every later phase).

## Architecture

```
src/lib/platforms/     ← the adapter boundary
  types.ts             normalized types + PlatformAdapter interface
  index.ts             getAdapter(platform) — the ONLY way app code gets an adapter
  sleeper/
    client.ts          fetch wrapper, timeouts, fixture mode
    pure.ts            dependency-free logic (unit tested)
    normalize.ts       zod validation + mapping to normalized types
    adapter.ts         SleeperAdapter implements PlatformAdapter
    playerCache.ts     ~5MB dictionary, refreshed at most once per 24h
src/lib/sports/        ← sport registry; football-specific labels live here
src/lib/sync/          ← syncLeague(): fetch-all-then-write, never partial
```

**Nothing outside `src/lib/platforms/` imports `SleeperAdapter`.** Application code only
knows the normalized types, so ESPN and manual/CSV adapters (Phase 7) drop in without the
engine changing. `getMatchups`, `getTransactions` and `getFreeAgents` are declared on the
interface now and throw `NotImplementedError` until their phases arrive.

## Failure behavior

- The sync **fetches everything before writing anything**, so a mid-sync failure never
  leaves half-updated rosters.
- On failure, existing rows are untouched. The league is stamped `syncStatus: "stale"` with
  the error, and both pages show a banner naming the error and the last good sync time.
- The player dictionary is best-effort. If it's unavailable the league still syncs and
  rosters render with player IDs and a warning, rather than failing.
- Malformed individual rosters or users are skipped, not fatal. Unexpected shapes are
  validated by zod and reported as a clear message.
- A valid-looking but nonexistent league ID (Sleeper answers `200 null`) is caught and
  reported as "check the league ID", not rendered as an empty league.

## Database

SQLite by default so it runs with zero setup. Prisma's SQLite connector has no native JSON
column type, so scoring settings, roster slots and platform IDs are stored as TEXT and read
through the typed helpers in `src/lib/json.ts`.

To switch to Postgres: set `DATABASE_URL` and change the `provider` in
`prisma/schema.prisma` from `"sqlite"` to `"postgresql"`. Nothing else changes — the JSON
helpers work identically on both.

## Defaults vs. real data

The only placeholders in the app are in `src/lib/defaults.ts` (12-team, PPR, "tech
rejects"). They appear **only** on the empty state, are labelled `Default`, and are used in
zero calculations. Synced data replaces them entirely.

## Not in this phase

No auth, payments, marketing pages, LLM features, projections, waivers, trades, or MCP.
Next up is Phase 2: nflverse ingest, player resolution, and the projection model.

## Contributing

Issues, ideas and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, the
checks CI runs, and the six constraints the project is built around.

## License

[MIT](./LICENSE) © 2026 Nihal Sirivolu
