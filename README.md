<img src="./docs/banner.svg" alt="Fantasy Copilot" width="100%">

# Fantasy Copilot

[![CI](https://github.com/nsirivolu27/fantasy-copilot/actions/workflows/ci.yml/badge.svg)](https://github.com/nsirivolu27/fantasy-copilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Fantasy Copilot includes an open, reproducible pipeline for studying NFL player knee-injury
reports. It converts public weekly reports into traceable player episodes, joins them to actual
game participation, and publishes the sample sizes and measured outcomes. The fantasy application
uses those outputs, but the injury-report calibration can be reproduced without a league or
database.

Built on free public data. **No paid APIs and no required API keys.**

## Open NFL player injury-report research

The pipeline documents what public NFL reporting can support about knee injuries: which players
were listed, how consecutive report weeks form an episode, whether a listed player participated,
and how many scheduled games passed before participation resumed. Every published rate includes
its sample count, and categories without diagnosis-level evidence remain visibly unmeasured.

The source data contains administrative injury labels and participation records. It does not
contain imaging, physical-exam findings, surgical details, or clinical diagnoses, so it cannot
identify structural knee abnormalities or estimate an individual player's medical prognosis.

### Reproduce the calibration

Requirements: Node.js 22 or newer and internet access to the free nflverse release files. No
database, fantasy league, or installed npm dependencies are required for calibration.

```bash
git clone https://github.com/nsirivolu27/fantasy-copilot.git fantasy-copilot-research
cd fantasy-copilot-research
npm run calibrate:injuries -- 2016-2025
npm run test:injury
```

Use the plain repository URL when cloning; Markdown link syntax such as `[URL](URL)` is not a
shell command. If a checkout already exists, update it instead of cloning over it:

```bash
cd fantasy-copilot
git status --short
git pull --ff-only origin main
npm run calibrate:injuries -- 2016-2025
npm run test:injury
```

If `git status --short package-lock.json` shows `?? package-lock.json`, that file came from the
older checkout and will conflict with the now-committed lockfile. Move it aside before pulling.
In PowerShell:

```powershell
Rename-Item package-lock.json package-lock.before-injury-update.json
git pull --ff-only origin main
```

`Missing script: "calibrate:injuries"` means the checkout still predates the injury pipeline;
`git pull --ff-only origin main` supplies it. A Windows `EPERM` error involving
`next-swc.win32-x64-msvc.node` means a running Next.js/Node process has the binary open. It does
not block the dependency-free calibration commands above. To reinstall the full application,
first stop that checkout's `npm run dev` or `next dev` terminal with Ctrl+C, then run:

```powershell
Remove-Item -LiteralPath node_modules -Recurse -Force
npm ci
```

The command downloads nflverse injury reports, weekly rosters, snap counts, and schedules. It
preserves the reported injury text, joins players through GSIS IDs, groups consecutive report
weeks into episodes, checks actual participation, and writes three reviewable outputs:

| Output | Purpose |
|---|---|
| [`calibration-summary.json`](./src/lib/injury/calibration-summary.json) | Seasons, source URLs, sample sizes, methods, measured ranges, and play rates |
| [`knee-injury-severity-map.json`](./src/lib/injury/knee-injury-severity-map.json) | Runtime category definitions and measured values where the source supports them |
| [`risk.ts`](./src/lib/injury/risk.ts) | Named designation play rates and the availability model used by start/sit |

The report classifier and availability assessment read those outputs at runtime; the calibration
script does not create a separate unpublished result that can drift from the committed evidence.

### Current injury-report sample

The committed calibration covers the 2016–2025 regular seasons.

| Measure | Result |
|---|---:|
| Eligible fantasy-player injury reports | 16,405 |
| Reports classified as knee injuries | 2,655 |
| Completed knee-injury episodes | 1,043 |
| Unspecified knee games-missed range | 0–1 games (25th–75th percentile) |
| Unspecified knee weekly play rate | 0.58 |
| Questionable play rate | 0.64 across 762 reports |
| Doubtful play rate | 0.00 across 74 reports |

nflverse's official reports identify these records as generic **Knee** injuries. They do not
provide enough diagnosis-level text to measure ACL, PCL, MCL, LCL, meniscus, patellar tendon,
bone bruise, or tendinitis groups separately. Those rows remain seed assumptions in the map and
have zero measured samples in the summary. Do not cite them as calibrated findings.

### Definitions and interpretation

| Term | Definition used here |
|---|---|
| Played | Logged at least one offensive, defensive, or special-teams snap |
| Episode | Consecutive injury-report weeks for the same player and category |
| Games missed | Scheduled regular-season team games before the player's next recorded snap |
| Games-missed range | 25th and 75th percentiles across completed episodes |
| Base return probability | Share of category report-weeks in which the player logged a snap |
| Designation play rate | Share of knee report-weeks at that designation with a recorded snap |

The analysis excludes episodes without an observed return, so the games-missed distribution is
right-censored and can understate long absences. It treats any snap as participation, does not
measure workload or physical function after return, and does not control for age, position,
surgery, team reporting policy, or repeated injuries. Results describe the completeness and
outcomes of historical injury reports. They are not medical guidance and should not be used for
diagnosis, treatment, clearance, or return-to-play decisions.

The calibration code is covered by the repository's [MIT license](./LICENSE). nflverse source
data remains subject to its upstream terms. When publishing derived work, cite this repository,
the exact commit, covered seasons, and the source URLs recorded in the calibration summary.

## Fantasy application and live team dashboard

**[Open the live dashboard](https://nsirivolu27.github.io/fantasy-copilot/?league=1391520474978066432&teams=2)**

Babble opens with nihalsirivolu's team selected. Sync a Sleeper username to discover every
current-season league, or connect a league URL. Choose teams, view weekly lineups and actual
scores, compare season analytics, and follow score changes as games progress. Connections can
be removed, shared by link, or exported/imported as portable JSON preferences.

In **Roster**, each player shows actual league points and a weekly Sleeper projection
scored with your league settings. Expand a player for the available passing, rushing,
receiving, kicking, defensive, and usage statistics, projected stats, and scoring breakdown.
Missing stats stay blank; incomplete scoring bonuses are identified beside the projection.

GitHub Pages serves the interactive dashboard. The browser reads Sleeper every minute while
visible; no scheduled commits are needed. The saved profiles for Babble, PS5, and tech rejects
open with the configured team selected, and any visitor can add or remove their own browser-local
profiles. See [dashboard setup](./GITHUB-DASHBOARD.md).

## Running app and plugin

Open `/live` in your running app, paste a Sleeper league URL, and share the resulting link.
Scores refresh every minute while the page is visible, with season power rankings, weekly
median scoring, and all-play comparisons. Failed refreshes keep the last good snapshot visible.

The [plugin authoring package](./plugins/fantasy-copilot/) includes portable and Codex manifests
plus a league check-in skill. The hosted MCP connection and public directory listing still need
configuration. See [live hosting and plugin setup](./LIVE-AND-PLUGIN.md) for what is ready and
what remains before hosting separate users' workspaces.

## 🏈 Kick off

Pick one. All three take a few minutes.

### Replit, no install

[![Run on Replit](https://replit.com/badge/github/nsirivolu27/fantasy-copilot)](https://replit.com/new/github/nsirivolu27/fantasy-copilot)

Click, then press Run. The committed `.replit` creates the database and starts the server.
Details and the Postgres switch for deploying: [REPLIT.md](./REPLIT.md).

### Docker, one command

```bash
git clone https://github.com/nsirivolu27/fantasy-copilot.git
cd fantasy-copilot
docker compose up -d
```

Postgres and the app both come up on http://localhost:3000.

### Local Node

```bash
git clone https://github.com/nsirivolu27/fantasy-copilot.git
cd fantasy-copilot
npm install
cp .env.example .env
npm run db:push
npm run dev
```

SQLite by default, so there is no database to set up.

## 📋 Your first five minutes

1. Open **Settings**, paste your Sleeper league ID, press **Sync league**.
   It is the long number in your league URL: `sleeper.com/leagues/`**`<this number>`**`/team`
2. Pick which synced team is yours.
3. Press **Refresh projections**. This pulls a season of nflverse stats, derives bye weeks and
   stores the schedule, which lights up `/lineup`, `/waivers` and `/streaming` at once.
4. Optional: add a model under **AI model** to enable chat. Groq has a free tier.

Check the format line on the league page. It should describe your league back to you, for example
`12-team, PPR, 1QB, 1 flex`. That line drives every value in the app, so if it is wrong, say so
before trusting anything else.

**No league ID handy?** `SLEEPER_FIXTURES=1 npm run dev` and use league ID `1124839284756483920`.
The whole sync path runs off `fixtures/`, no network needed.

## 📊 What you get

| Page | What it does |
|---|---|
| `/` | Your roster with projections, and the problems worth acting on today |
| `/league` | Standings, power rankings, win probabilities, playoff odds, weekly digest |
| `/lineup` | Current vs optimal lineup, what each change is worth, coin flips labelled |
| `/waivers` | Free agents ranked by what they add to *your* lineup, with FAAB bids |
| `/streaming` | QB/TE/K/DST planned three weeks ahead by matchup |
| `/chat` | Ask about your league; answers grounded in tool calls, never invented |
| `/model` | The projection model's real accuracy, including where it is weak |
| `/live` | Live Sleeper scores, selected teams, player statistics and league analytics |

Plus an [MCP server](./MCP.md) so Claude Desktop or Cursor can query your league directly.

### Any league format, no configuration

Nothing about scoring or roster shape is hardcoded. Scoring values, roster slots, team count,
playoff settings and the current week all come from your league, and **replacement level is
derived from them** rather than assumed. So a superflex league correctly makes quarterbacks
scarce, a 14-team league values depth higher than a 10-team one, and TE premium changes tight end
values, all with no configuration.

## 🚀 Hosting it for other people

Running it for yourself needs no accounts at all. Hosting it for your league, or for strangers,
does. Set `REQUIRE_AUTH=1` and the app grows a sign-up and sign-in flow:

- **The first account always succeeds and becomes the owner**, so a fresh deployment can be
  claimed by whoever sets it up.
- **After that, signups are closed by default.** Open them with `ALLOW_SIGNUPS=1`, or hand your
  league an `INVITE_CODE`. A hosted app should not start accepting strangers because nobody
  remembered to lock it.
- Passwords are hashed with scrypt from `node:crypto`, so there is no native dependency to build.
  Session cookies are `httpOnly` and only their hash is stored, so a database leak yields no
  usable logins.
- There is **no password reset yet**, because the app sends no email and adding a mail provider
  would break the no-paid-services promise. The owner can reset one directly in the database.

Where to run it:

| | |
|---|---|
| **[REPLIT.md](./REPLIT.md)** | Replit, fastest path from nothing to running |
| **[DEPLOYING.md](./DEPLOYING.md)** | Vercel, Docker, Railway, Render, Fly |
| **[AWS.md](./AWS.md)** | Production AWS: Fargate, RDS, ECR, CDK in `infra/` |

## ✅ Tests

```bash
npm test        # 188 checks, no database and no network needed
npm run backtest 2024   # measure the projection model against a real season
npm run build:dashboard # verify the static GitHub Pages dashboard
```

## 🗺️ Roadmap

| Phase | What lands | Status |
|---|---|---|
| 1 | Foundation, adapter boundary, Sleeper league sync | ✅ Done |
| 2 | nflverse ingest, player resolution, projection model, backtest | ✅ Done |
| 3 | Start/sit optimizer, bye and injury alerts | ✅ Done |
| 4 | Waiver targets, FAAB bids, streaming planner | ✅ Done |
| 5 | Trade engine, value providers, "find me a trade" | ✅ Done |
| 6 | League hub: power rankings, playoff odds, weekly digest | ✅ Done |
| 7 | ESPN + manual/CSV adapters | ⬜ |
| 8 | Tool registry + retrieval layer + configurable LLM (any provider) | ✅ Done |
| 9 | League chat, grounded in tools and retrieval | ✅ Done |
| 10 | MCP server, query your league from any AI client | ✅ Done |
| 11 | Decision Leverage (Δ win%) + published calibration | ⬜ Next |
| 12 | Fitted projection model + season learning loop | ⬜ |
| 13 | Polish | ⬜ |
| Extra | Deployable: Postgres, Docker, health check, scheduled sync, site lock | ✅ Done |
| Extra | Bye weeks derived from the nflverse schedule | ✅ Done |
| Extra | Accounts: sign-up, sign-in, owner claim, invite codes | ✅ Done |
| Extra | Live Sleeper dashboard and GitHub Pages profiles | ✅ Done |
| Extra | Historical knee-injury calibration | ✅ Done |

## 📉 What the backtest says

The projection model was tested against the **real 2024 nflverse season 3,415
player-weeks**: and the numbers are published in the app at `/model`, including the ones
that don't flatter it. Mean absolute error, fantasy points per game, full PPR:

| | This model | Last week's points | Season average |
|---|---|---|---|
| QB | **5.98** | 7.47 | 6.14 |
| RB | **4.97** | 5.98 | 5.00 |
| WR | **5.03** | 6.41 | 5.03 |
| TE | **3.96** | 5.17 | 3.98 |
| **All** | **4.90** | 6.17 | 4.94 |

It beats both baselines at every position, **by 0.7% overall**: and 2.6% at QB. That is a
small edge, and pretending otherwise would be the easiest lie in fantasy software.

The first version of this model *lost* to a season average by 4.4%, because it leaned on a
four-game recency weighting. The fix came from sweeping the blend weight against real data
rather than tuning by intuition: the season average became the anchor, with a per-position
opportunity term blended in at weights the backtest chose (QB 80%, RB 40%, TE 30%, WR 20%).

**The honest conclusion is that weekly fantasy scoring is mostly noise**: a season average
is a hard baseline, and no simple projection beats it by much. That is not a reason to skip
projections, it's the reason the roadmap spends its real effort somewhere else.

Reproduce it yourself:

```bash
curl -L -o player_stats_2024.csv \
  https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_2024.csv
npm run backtest 2024
```

## 🔀 Start/sit

The `/lineup` page compares your current lineup to the optimal one and shows what each change is
worth. Three decisions shape it:

- **Players who can't play are removed from the pool**: not merely flagged, the optimizer will
  never suggest starting someone who's Out or on bye.
- **Anything under 1.5 points is labelled a coin flip**: not a recommendation. Most start/sit
  calls genuinely are close, and manufacturing confidence from a 0.4-point gap is how a tool
  loses trust.
- **Bye weeks are derived, not hardcoded.** No free source publishes a bye list, but nflverse
  publishes every game, a team's bye is the regular-season week it doesn't appear. That stays
  correct every season with no maintenance.

The slot-filling order matters too: the optimizer fills the most restrictive slots first, which
is the fix for the classic FLEX bug where a naive pass hands your best RB to the FLEX and leaves
RB2 empty.

Injury availability is applied once, after the base projection. The reproducible nflverse
calibration covers 16,405 reports from 2016–2025: 2,655 knee reports formed 1,043 completed
episodes. An unspecified knee injury measured at 0–1 games missed with a 0.58 weekly return
probability; Questionable players played in 64% of 762 reports, while none of the 74 Doubtful
reports logged a snap. nflverse labels these reports as generic knee injuries, so diagnosis-level
ACL, MCL, meniscus, and tendon ranges remain explicitly uncalibrated. The generated evidence is
published in [`calibration-summary.json`](./src/lib/injury/calibration-summary.json).

## 🔎 Waivers and streaming

`/waivers` ranks free agents by **what each adds to your starting lineup**: not by raw
projection. A 12-point WR is a big add for a team starting a 6-point WR and worth nothing to a
team starting three better ones, measuring the lineup delta answers the question you actually
have. Free agents have no stored projections, so they're projected on the fly from their nflverse
history using your league's scoring.

**FAAB bids** scale with three things: how much the add improves your lineup, how many weeks are
left to enjoy it, and how much budget the rest of the league still holds. A big gain in week 14 is
worth less than the same gain in week 3, and a league that has already spent its money is one you
can win cheaply. Rolling-priority leagues get "worth a claim: yes/no" instead, never a dollar
figure for a league with no budget.

**Drop candidates** are ranked by what the lineup loses, which is not the same as lowest
projection: a backup QB with nobody behind him can cost more than a spare RB in a deep room.

`/streaming` plans QB/TE/K/DST three weeks ahead, colouring each matchup by how generous that
defense has been to the position this season.

Sleeper's trending-add counts appear beside the ranking, clearly labelled as market hype. They are
never part of the ranking itself, the point is to see when the crowd and the model disagree.

## 🤝 The trade engine

A trade is judged by **what it does to each roster's best legal starting lineup**: not by
comparing player values in the abstract. That single decision is what makes the output useful:

- A fourth good running back is worth almost nothing to a team already starting three.
- The same trade is scored separately for each side, and a tool that tells you every trade you
  propose is a win is worthless, because the other manager won't accept it.
- `find_trades` scans all other rosters for one-for-one swaps that improve **both** teams, ranked
  so the fairest surface first.

Player values sit behind a `TradeValueProvider` interface, built-in points-above-replacement
(scaled by weeks remaining, age-curved in dynasty), any HTTP endpoint, or an imported CSV value
chart. The popular trade calculators publish no public API, so there's no fake client for one in
this repo; the generic providers are the honest path.

## 💬 The chat layer

Ask your league questions in plain language. Two things make the answers trustworthy:

**Retrieval, not vibes.** The synced league becomes a few hundred short documents, the
league itself, its scoring, each team, each roster, each rostered player, indexed with
BM25. Relevant ones are retrieved for every question and handed to the model as context.
It's lexical rather than embedding-based on purpose: embeddings cost money or need a key,
and league data is short, factual and full of proper nouns, which is exactly where lexical
scoring is strongest.

**Tools, not memory.** Seventeen read-only tools are defined once in
`src/lib/tools/registry.ts`, including projections, start/sit, waivers, trades, simulations,
weekly digest, search, and the selected live dashboard. Chat, HTTP MCP, and stdio MCP all expose
that same registry. There is deliberately no second list.

Doing both means the app works across the whole range of models someone might plug in: a
weak local model still gets correct facts pushed into its context, while a strong one goes
and fetches exactly what it needs. Tool calls are shown in the UI, collapsible, so you can
check the work.

The system prompt forbids stating any number that did not come from a tool or retrieved context.
Start/sit answers use the optimizer and calibrated availability pipeline, and missing projections
are reported as missing rather than guessed.

## 🎨 Design

Light-first, with dark as an explicit override and a toggle in the header. No component names a
colour, everything runs through semantic tokens and six tints, which is what makes the theme flip
a palette change rather than a sweep. See [DESIGN.md](./DESIGN.md).

## 🧱 Architecture

```
src/lib/core/          pure domain layer, zero dependencies
  trade/engine.ts      lineup optimizer, start/sit advice, trade evaluation,
                       waiver ranking, FAAB bids, league format derivation
  trade/value.ts       TradeValueProvider, built-in plus HTTP and CSV
  league.ts            power rankings, matchup simulation, playoff odds
  matchups.ts          defensive strength, upcoming opponents
  schedule.ts          bye weeks derived from the schedule
src/lib/platforms/     the adapter boundary; SleeperAdapter implements all of it
src/lib/projections/   scoring (league aware), model v2, projection runs
src/lib/injury/        classifier, calibrated availability and projection adjustment
src/lib/live/          live snapshot cache, profile parsing and selected-team filtering
src/lib/rag/           BM25 index over documents built from the synced league
src/lib/tools/         one registry, read by both chat and MCP
src/lib/{lineup,waivers,league,trade}/service.ts   database to core bridges
github-dashboard/      static GitHub Pages build using the shared live dashboard
infra/                 AWS CDK stack
```

Two boundaries carry the weight.

**Core is pure.** No Prisma, no Next, no React, no npm dependencies, and no relative imports
between core modules, which is what lets each be unit tested with no build step.
`npm run test:boundaries` fails the build if that slips.

**Platforms are behind an adapter.** Nothing outside `src/lib/platforms/` imports
`SleeperAdapter`; app code only knows the normalized types. ESPN and manual/CSV adapters drop in
without the engine changing, and the test of that is whether adding one touches any file outside
that folder.

Contributor guide: [AGENTS.md](./AGENTS.md), which coding agents read automatically.

## 🛟 When things break

- The sync **fetches everything before writing anything**: so a mid-sync failure never
  leaves half-updated rosters.
- On failure, existing rows are untouched. The league is stamped `syncStatus: "stale"` with
  the error, and both pages show a banner naming the error and the last good sync time.
- The player dictionary is best-effort. If it's unavailable the league still syncs and
  rosters render with player IDs and a warning, rather than failing.
- Malformed individual rosters or users are skipped, not fatal. Unexpected shapes are
  validated by zod and reported as a clear message.
- A valid-looking but nonexistent league ID (Sleeper answers `200 null`) is caught and
  reported as "check the league ID", not rendered as an empty league.

## 🗄️ Database

SQLite by default so it runs with zero setup. Prisma's SQLite connector has no native JSON
column type, so scoring settings, roster slots and platform IDs are stored as TEXT and read
through the typed helpers in `src/lib/json.ts`.

Switching to Postgres is just setting `DATABASE_URL`. `scripts/prisma-schema.mjs` picks the
provider from the URL scheme, so `file:` means SQLite and `postgresql://` means Postgres with no
schema edit. The JSON helpers work identically on both.

## 🙌 Contributing

Issues, ideas and PRs welcome, see [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, the
checks CI runs, and the twelve constraints the project is built around.

## ⚖️ License

[MIT](./LICENSE) © 2026 Nihal Sirivolu
