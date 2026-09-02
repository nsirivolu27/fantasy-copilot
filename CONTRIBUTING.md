# Contributing

Thanks for taking a look. This is a hobby project built in public — issues, ideas and PRs
are all welcome.

## Getting set up

```bash
npm install
cp .env.example .env
npx prisma db push
npm run dev
```

No API keys, no accounts, no paid services. If you don't have a Sleeper league ID to test
with, run `SLEEPER_FIXTURES=1 npm run dev` and use league ID `1124839284756483920` — the
whole sync path runs off the JSON in `fixtures/`.

## Before opening a PR

```bash
node --experimental-strip-types scripts/test-normalize.mjs   # unit tests, no deps needed
npx tsc --noEmit                                             # typecheck
npx next build                                               # build
```

CI runs exactly these.

## The rules that matter

These are the constraints the project is built around. A PR that breaks one of them will
get pushback even if the code is good:

1. **No paid APIs and no required API keys.** Every data source must be free and public.
   The only credentials anywhere are the user's own (their ESPN cookies, their own LLM key).
2. **Nothing about league format is hardcoded.** Scoring values, roster slots, team count,
   season and week all come from the league sync. A 12-team half-PPR 1QB league and a
   10-team superflex dynasty must both work with zero code changes.
3. **Platform code stays behind the adapter.** Nothing outside `src/lib/platforms/` may
   import `SleeperAdapter` or any other adapter — application code only knows the
   normalized types in `src/lib/platforms/types.ts`.
4. **Sport-specific logic stays in `src/lib/sports/<sport>/`.** The engine goes through
   `getSportModule()` so other sports can be added later.
5. **Degrade, never crash.** An upstream failure preserves cached data and surfaces a
   stale banner. Unexpected API shapes are validated and reported, not thrown raw.
6. **Later phases: the LLM explains, it never computes.** No projection, rank or
   probability may originate from a language model.

## Code style

Human-readable and boring on purpose. Clear names, comments only where the logic isn't
obvious (Sleeper's split points fields, lineup-slot ordering — that kind of thing). No
clever metaprogramming. If a junior dev can't follow it on first read, simplify it.

## Roadmap

See the phase list in the README. Phases are built in order — a PR implementing Phase 5
before Phase 3 exists will be hard to review, so open an issue first if you want to jump
ahead.

## Two more rules, added with the chat layer

7. **The LLM explains; it never computes.** No projection, rank, probability or league fact
   may originate from a language model. Numbers come from tools and retrieval. The system
   prompt says so explicitly — don't loosen it.
8. **Tools are defined once.** `src/lib/tools/registry.ts` is the single list. The chat
   route and (in Phase 10) the MCP server both read from it. A PR that adds a tool in a
   second place will be sent back.

## Two more rules, added with the integration layer

9. **`src/lib/core/` stays pure.** No Prisma, no Next, no React, no npm dependencies, and no
   relative imports between core modules. `npm run test:boundaries` enforces all of it. That
   purity is what lets the trade marketplace share the engine without dragging the database
   along, and what keeps every core module unit testable on its own.
10. **Don't invent third-party APIs.** If a service has no public API, add a generic adapter
    (HTTP endpoint, CSV import) rather than a client for endpoints you guessed at. A wrong
    integration is worse than an honest manual one.
