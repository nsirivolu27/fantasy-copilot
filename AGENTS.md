# AGENTS.md

Context for coding agents working in this repo.

**This file is canonical.** Codex reads it automatically. `CLAUDE.md` and `.cursorrules` are
shorter pointers to it, so the rules live in one place and cannot drift.

## What this is

**Fantasy Copilot**: a free, self-hosted fantasy football companion. It syncs a league from
Sleeper, projects players, and helps with start/sit, waivers, streaming and trades. There's a
chat interface grounded in the league's real data and an MCP server exposing the same tools.

**Nine of the thirteen phases are built and 133 tests pass. Your job is to finish it, not redesign it.**

## Commands

```bash
npm install
npm run db:push        # create/update the schema (idempotent)
npm run dev            # http://localhost:3000
npm test               # 133 checks, no database and no network needed
npx tsc --noEmit       # typecheck
npm run build          # full build
npm run backtest 2024  # measure the projection model against real data
```

No league ID to test with? `SLEEPER_FIXTURES=1 npm run dev` and use league ID
`1124839284756483920`, the whole sync path runs off `fixtures/`.

## Architecture

```
src/lib/core/          PURE domain layer. The important one, see below.
  trade/engine.ts      optimizeLineup, adviseLineup, evaluateTrade, rankAdditions,
                       rankDrops, recommendFaabBid
  trade/value.ts       TradeValueProvider + built-in / HTTP / CSV implementations
  league.ts            powerRankings, simulateMatchup, playoffOdds, seeded RNG
  matchups.ts          pointsAllowedByDefense, upcomingOpponents
  schedule.ts          deriveByeWeeks
  index.ts             the public barrel

src/lib/platforms/     PlatformAdapter interface; SleeperAdapter implements all of it
src/lib/projections/   scoring.ts (league-aware), model.ts (v2), run.ts
src/lib/rag/           BM25 index over documents built from the synced league
src/lib/tools/registry.ts   16 read-only tools, the ONE source for chat and MCP
src/lib/llm/           provider layer over plain fetch, no SDK
src/lib/{lineup,waivers,league,trade}/service.ts   DB → core bridges
src/app/               /, /league, /lineup, /waivers, /streaming, /chat, /model, /settings
scripts/test-*.mjs     dependency-free tests, run with node --experimental-strip-types
```

### The core layer is the thing to understand

Everything under `src/lib/core/` is pure: **no Prisma, no Next, no React, no npm dependencies,
and no relative imports between core modules.** Each file stands alone.

That last constraint is load-bearing and looks odd until you know why: Node's
`--experimental-strip-types` can't resolve extensionless relative imports, and that's what lets
these modules be unit tested directly with zero build step. If you need something from another
core module, either duplicate a trivial helper (`round2`) or put the two things in the same file
because they're actually one idea.

`npm run test:boundaries` fails the build if any of this is violated. Don't work around it.

**All decision logic goes in core, with tests.** Service files load rows and call core. React
components render. If you find yourself computing a projection or ranking in a component or an
API route, it's in the wrong place.

## The rules this repo is built on

A change that breaks one of these is wrong even if it works:

1. **No paid APIs, no required API keys.** Free public data only. Sleeper for leagues, nflverse
   for stats. The only credentials anywhere are the user's own (their ESPN cookies, their own
   LLM key).
2. **Nothing about league format is hardcoded.** Scoring values, roster slots, team count, season
   and week all come from the sync. A 12-team half-PPR 1QB league and a 10-team superflex dynasty
   must both work with zero code changes. `scoring.ts` scores any stat line with the league's own
   settings, that's the mechanism.
3. **Platform code stays behind the adapter.** Nothing outside `src/lib/platforms/` imports
   `SleeperAdapter`. App code only knows the normalized types in `platforms/types.ts`.
4. **Sport-specific logic stays in `src/lib/sports/<sport>/`,** reached through `getSportModule()`.
5. **Degrade, never crash.** Upstream failure preserves cached data and shows a stale banner.
   Unexpected API shapes are validated (zod at the platform boundary) and reported, never thrown
   raw. A player-dictionary failure must not fail a league sync.
6. **Core stays pure.** See above.
7. **The LLM explains; it never computes.** No projection, rank or probability originates from a
   language model. The system prompt in `src/lib/llm/systemPrompt.ts` says so explicitly, don't
   loosen it.
8. **Tools are defined once,** in `src/lib/tools/registry.ts`. Chat and MCP both read that array.
   Never create a second list.
9. **Say when a call is close.** Sub-1.5-point start/sit gaps are coin flips and are labelled as
   such. Never manufacture confidence the numbers don't support.
10. **Don't invent third-party APIs.** No public API means a generic adapter (HTTP endpoint, CSV
    import), never a client for guessed endpoints.
11. **Never write a raw colour utility.** No `bg-white/5`, `text-black`, or `bg-emerald-500/15`.
    Use a token (`bg-[var(--panel)]`), a `tone` prop, or a `.tint-*` class, see `DESIGN.md`. The
    app is light-first with a dark override, and a hardcoded colour is wrong in one of them.
12. **Human-readable, intern-level code.** Clear names; comments only where the logic isn't
    obvious. No clever metaprogramming.

## Honesty is a feature here, not a posture

The projection model is **0.7% better than a season average**: measured on 3,415 real
player-weeks and published at `/model`, including the parts that don't flatter it. Version 1 was
*4.4% worse* than that baseline and got rewritten because the backtest said so.

Consequences for you:

- Never claim accuracy you haven't backtested. `npm run backtest 2024` is the arbiter.
- If a change doesn't beat the current numbers, say so in the report card and keep what's there.
- Every projection ships with floor, ceiling and confidence. Don't strip them to simplify a UI.
- The interesting work is **decision leverage** (Phase 11), not chasing projection accuracy.

## Accounts

Off by default (`REQUIRE_AUTH=1` turns them on), because running this for yourself needs no
login. When on: the first account becomes the owner, then signups close unless `ALLOW_SIGNUPS=1`
or an `INVITE_CODE` is set.

Rules of the layer: password rules live in `src/lib/core/auth.ts` and are tested; hashing is
scrypt from `node:crypto` with no native dependency; only a session token's SHA-256 is stored;
sign-in hashes even for a missing user so the form cannot enumerate accounts. Middleware runs on
the edge and can only check that a cookie exists, so every page validates the session itself.

## Testing conventions

Tests are plain Node scripts, no framework:

```js
// scripts/test-thing.mjs
import assert from "node:assert/strict";
import { thing } from "../src/lib/core/thing.ts";

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

test("describes a behaviour, not a function name", () => {
  assert.equal(thing(1), 2);
});

console.log(`\n${passed} passing\n`);
```

Add the file to the `test` script in `package.json`. Write tests that would catch a real bug, the ones that have earned their keep here caught a stranded FLEX slot, a QB being cheaper to drop
than a worse RB, and a model that lost to its own baseline.

## What's left

| Phase | Work | Notes |
|---|---|---|
| 11 | **Decision leverage + calibration** | The flagship. Rank every decision by Δ win probability, not Δ points, using `simulateMatchup`. Log recommendations with their confidence and grade them later; publish the calibration curve on `/model`. |
| 7 | ESPN + manual/CSV adapters | Base URL `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{id}`, repeated `?view=` params. Private leagues need the user's `espn_s2` and `SWID` cookies, stored in the DB, never logged, never sent to the browser. **Success means no file outside `src/lib/platforms/` changed.** |
| 12 | Fitted projection model | Ridge regression on nflverse features, plain TypeScript, no ML dependency. Must beat v2 in the backtest or it doesn't ship. |
| 13 | Polish | Mobile pass, remaining empty/error states, dead code. |

## Do not

- Rewrite, restructure or "modernize" working code.
- Add dependencies. This runs on Next, Prisma, Tailwind and zod, deliberately.
- Put decision logic in a component or an API route.
- Create a second list of tools.
- Let a language model produce a number.
- Hardcode scoring, roster slots, week, season or a provider.
- Weaken or delete a test to make it pass.
- Skip `npm test`, `npx tsc --noEmit` and `npm run build` before calling something done.
