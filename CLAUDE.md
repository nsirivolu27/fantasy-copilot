# CLAUDE.md

Context for Claude Code working in this repo.

**The full brief is [AGENTS.md](./AGENTS.md).** Read it before writing code. It covers the
architecture, the commands, the testing conventions and the twelve rules the project is built
around. This file exists so Claude Code finds that brief automatically, and repeats the handful
of rules that are expensive to rediscover.

## What this is

Fantasy Copilot: a free, self-hosted fantasy football companion. Sleeper sync, projections
backtested on real data, start/sit, waivers, streaming, trades, a league hub, a grounded chat
layer and an MCP server. Nine of the thirteen phases are built and 133 tests pass.

**Finish it, do not redesign it.**

## Commands

```bash
npm install
npm run db:push        # create or update the schema, idempotent
npm run dev
npm test               # 133 checks, no database and no network
npx tsc --noEmit
npm run build
npm run backtest 2024  # measure the projection model against a real season
```

`SLEEPER_FIXTURES=1 npm run dev` with league ID `1124839284756483920` runs the whole sync path
offline.

## The five that bite hardest

1. **`src/lib/core/` is pure.** No Prisma, no Next, no React, no npm dependencies, and **no
   relative imports between core modules**. Each file stands alone. That last rule looks strange
   until you know why: Node's `--experimental-strip-types` cannot resolve extensionless relative
   imports, and that is what lets these modules be unit tested with no build step. If you need
   something from a sibling, duplicate a trivial helper or put the two things in one file because
   they are one idea. `npm run test:boundaries` fails the build if this slips.
2. **All decision logic goes in core, with tests.** Services load rows and call core. Components
   render. A projection or ranking computed in a component or an API route is in the wrong place.
3. **Tools are defined once**, in `src/lib/tools/registry.ts`. Chat and MCP both read that array.
   Never create a second list.
4. **The LLM explains, it never computes.** No projection, rank or probability originates from a
   language model. The system prompt says so; do not loosen it.
5. **Never write a raw colour utility.** No `bg-white/5`, `text-black`, `bg-emerald-500/15`. Use a
   token, a `tone` prop, or a `.tint-*` class. The app is light-first with a dark override and a
   hardcoded colour is wrong in one of them. See [DESIGN.md](./DESIGN.md).

## Honesty is a feature here

The projection model is **0.7% better than a season average**, measured on 3,415 real
player-weeks and published in the app at `/model`, including the parts that do not flatter it.
Version 1 was *4.4% worse* than that baseline and got rewritten because the backtest said so.

So: never claim accuracy you have not backtested, and if a change does not beat the current
numbers, say so in the report card and keep what is there.

## What is left

Four phases, and `AGENTS.md` has the detail on each:

- **Phase 11, decision leverage and calibration.** The flagship. Rank decisions by change in win
  probability rather than change in points, using `simulateMatchup`. Start here.
- **Phase 7, ESPN and manual/CSV adapters.** Success means an ESPN league renders identically to
  a Sleeper one **and no file outside `src/lib/platforms/` changed**. That is the real test of the
  adapter boundary.
- **Phase 12, fitted projection model.** Ridge regression on nflverse features, plain TypeScript,
  no ML dependency. Must beat v2 in the backtest or it does not ship.
- **Phase 13, polish.**

## Before saying anything is done

`npm test`, `npx tsc --noEmit` and `npm run build`. All three.
