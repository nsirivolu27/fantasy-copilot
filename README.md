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

**[Live interactive preview →](https://claude.ai/code/artifact/7799e1d0-791a-424e-b213-dfa2ecf44532)** — the interface with real fixture data and real model output. Source in [`demo/`](./demo).

> **Status: Phases 1–6, 8, 9 and 10 — ten of thirteen.** League sync, projections backtested on real
> nflverse data, a start/sit optimizer, waivers and streaming, a trade engine, a league
> hub with simulated win probabilities, an MCP server, retrieval and grounded chat all work end to
> end. Decision leverage and the ESPN adapter are next.

---

## Roadmap

| Phase | What lands | Status |
|---|---|---|
| 1 | Foundation, adapter boundary, Sleeper league sync | ✅ Done |
| — | Deployable: Postgres, Docker, health check, scheduled sync, site lock | ✅ Done |
| — | Bye weeks derived from the nflverse schedule | ✅ Done |
| 8 | Tool registry + retrieval layer + configurable LLM (any provider) | ✅ Done |
| 9 | League chat, grounded in tools and retrieval | ✅ Done |
| 2 | nflverse ingest, player resolution, projection model, backtest | ✅ Done |
| 3 | Start/sit optimizer, bye and injury alerts | ✅ Done |
| 4 | Waiver targets, FAAB bids, streaming planner | ✅ Done |
| 5 | Trade engine, value providers, "find me a trade" | ✅ Done |
| 6 | League hub: power rankings, playoff odds, weekly digest | ✅ Done |
| 7 | ESPN + manual/CSV adapters | ⬜ |
| 10 | MCP server — query your league from any AI client | ✅ Done |
| 11 | Decision Leverage (Δ win%) + published calibration | ⬜ Next |
| 12 | Fitted projection model + season learning loop | ⬜ |
| 13 | Polish | ⬜ |

## What the backtest says

The projection model was tested against the **real 2024 nflverse season — 3,415
player-weeks**, and the numbers are published in the app at `/model`, including the ones
that don't flatter it. Mean absolute error, fantasy points per game, full PPR:

| | This model | Last week's points | Season average |
|---|---|---|---|
| QB | **5.98** | 7.47 | 6.14 |
| RB | **4.97** | 5.98 | 5.00 |
| WR | **5.03** | 6.41 | 5.03 |
| TE | **3.96** | 5.17 | 3.98 |
| **All** | **4.90** | 6.17 | 4.94 |

It beats both baselines at every position — **by 0.7% overall**, and 2.6% at QB. That is a
small edge, and pretending otherwise would be the easiest lie in fantasy software.

The first version of this model *lost* to a season average by 4.4%, because it leaned on a
four-game recency weighting. The fix came from sweeping the blend weight against real data
rather than tuning by intuition: the season average became the anchor, with a per-position
opportunity term blended in at weights the backtest chose (QB 80%, RB 40%, TE 30%, WR 20%).

**The honest conclusion is that weekly fantasy scoring is mostly noise**, a season average
is a hard baseline, and no simple projection beats it by much. That is not a reason to skip
projections — it's the reason the roadmap spends its real effort somewhere else.

Reproduce it yourself:

```bash
curl -L -o player_stats_2024.csv \
  https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_2024.csv
npm run backtest 2024
```

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

## Design

Light-first, with dark as an explicit override and a toggle in the header. No component names a
colour — everything runs through semantic tokens and six tints, which is what makes the theme flip
a palette change rather than a sweep. See [DESIGN.md](./DESIGN.md).

## Running it

Import into **Replit** and press Run — the committed `.replit` creates the schema and starts the
server ([REPLIT.md](./REPLIT.md)). Or `docker compose up -d` locally, or push to Vercel with a
free Neon database. Environment variables and the serverless caveats are in
[DEPLOYING.md](./DEPLOYING.md).

## Start/sit

The `/lineup` page compares your current lineup to the optimal one and shows what each change is
worth. Three decisions shape it:

- **Players who can't play are removed from the pool**, not merely flagged — the optimizer will
  never suggest starting someone who's Out or on bye.
- **Anything under 1.5 points is labelled a coin flip**, not a recommendation. Most start/sit
  calls genuinely are close, and manufacturing confidence from a 0.4-point gap is how a tool
  loses trust.
- **Bye weeks are derived, not hardcoded.** No free source publishes a bye list, but nflverse
  publishes every game — a team's bye is the regular-season week it doesn't appear. That stays
  correct every season with no maintenance.

The slot-filling order matters too: the optimizer fills the most restrictive slots first, which
is the fix for the classic FLEX bug where a naive pass hands your best RB to the FLEX and leaves
RB2 empty.

## Waivers and streaming

`/waivers` ranks free agents by **what each adds to your starting lineup**, not by raw
projection. A 12-point WR is a big add for a team starting a 6-point WR and worth nothing to a
team starting three better ones — measuring the lineup delta answers the question you actually
have. Free agents have no stored projections, so they're projected on the fly from their nflverse
history using your league's scoring.

**FAAB bids** scale with three things: how much the add improves your lineup, how many weeks are
left to enjoy it, and how much budget the rest of the league still holds. A big gain in week 14 is
worth less than the same gain in week 3, and a league that has already spent its money is one you
can win cheaply. Rolling-priority leagues get "worth a claim: yes/no" instead — never a dollar
figure for a league with no budget.

**Drop candidates** are ranked by what the lineup loses, which is not the same as lowest
projection: a backup QB with nobody behind him can cost more than a spare RB in a deep room.

`/streaming` plans QB/TE/K/DST three weeks ahead, colouring each matchup by how generous that
defense has been to the position this season.

Sleeper's trending-add counts appear beside the ranking, clearly labelled as market hype. They are
never part of the ranking itself — the point is to see when the crowd and the model disagree.

## The trade engine

A trade is judged by **what it does to each roster's best legal starting lineup**, not by
comparing player values in the abstract. That single decision is what makes the output useful:

- A fourth good running back is worth almost nothing to a team already starting three.
- The same trade is scored separately for each side — and a tool that tells you every trade you
  propose is a win is worthless, because the other manager won't accept it.
- `find_trades` scans all other rosters for one-for-one swaps that improve **both** teams, ranked
  so the fairest surface first.

Player values sit behind a `TradeValueProvider` interface — built-in points-above-replacement
(scaled by weeks remaining, age-curved in dynasty), any HTTP endpoint, or an imported CSV value
chart. The popular trade calculators publish no public API, so there's no fake client for one in
this repo; the generic providers are the honest path.

## The chat layer

Ask your league questions in plain language. Two things make the answers trustworthy:

**Retrieval, not vibes.** The synced league becomes a few hundred short documents — the
league itself, its scoring, each team, each roster, each rostered player — indexed with
BM25. Relevant ones are retrieved for every question and handed to the model as context.
It's lexical rather than embedding-based on purpose: embeddings cost money or need a key,
and league data is short, factual and full of proper nouns, which is exactly where lexical
scoring is strongest.

**Tools, not memory.** Five read-only tools (`get_league_info`, `list_teams`, `get_roster`,
`find_player`, `search_league`) are defined once in `src/lib/tools/registry.ts`. The chat
route converts them into the model's function-calling format; the MCP server will expose
the same array in Phase 10. There is deliberately no second list.

Doing both means the app works across the whole range of models someone might plug in: a
weak local model still gets correct facts pushed into its context, while a strong one goes
and fetches exactly what it needs. Tool calls are shown in the UI, collapsible, so you can
check the work.

The system prompt forbids stating any number that didn't come from a tool or the retrieved
context, and forbids inventing projections or start/sit advice that the app hasn't built
yet. Ask it who to start and it will tell you that isn't built, rather than guessing.

### Bring your own model

Providers are database rows, not code — add one in Settings, no redeploy. Nearly every
provider speaks the OpenAI chat-completions format, so one adapter plus a base URL covers
**Groq, OpenRouter, Together, DeepSeek, Ollama, LM Studio and vLLM**; Anthropic gets its
own branch. There is no SDK and no new dependency — it's about 300 readable lines of
`fetch`.

Groq's free tier is the recommended starting point. Ollama costs nothing and never leaves
your machine.

## Phase 1 — the foundation

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
npm test
```

Twenty checks, no dependencies and no database needed: ten on the logic most likely to be
silently wrong: lineup-slot assignment, empty
starter slots, IR/taxi separation, Sleeper's split points fields, team-name fallbacks, and
that nothing about the league format is hardcoded — plus ten on the retrieval layer,
checking that a player question actually retrieves that player, that rare terms outrank
common ones, and that a no-match query returns nothing rather than noise.

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
