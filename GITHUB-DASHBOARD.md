# GitHub team dashboard

Live URL: https://nsirivolu27.github.io/fantasy-copilot/

## Use and share

- The default configuration opens Babble, roster 2 (nihalsirivolu). PS5 and tech rejects are
  also available as saved connections with this account's own team selected.
- Use **Sync all leagues from a Sleeper account** to discover all current-season football
  leagues. Owned and co-owned rosters are selected in newly connected leagues. Existing
  choices are kept. No maximum league count is imposed by the discovery flow.
- Choose teams under **Teams to display**. An empty selection shows no teams. Opponents
  remain hidden unless selected too. **Save displayed teams** keeps choices in this browser.
- Remove a saved league with its × button. This removes local preferences, not the league
  on Sleeper. An explicit future account sync may add it again.
- Share a URL or export a JSON dashboard to another person. Imports contain only version,
  platform, league ID, name, and team IDs. No API keys or connected-app URLs are exported.
- Preferences are browser-local, not login-backed account settings. Clearing browser data
  restores this deployment's defaults on the next visit.

## Live data and analytics

The Roster view includes each player's league-specific actual matchup points and
weekly Sleeper projections scored with the league's scoring multipliers. Expand
a player to see every numeric stat supplied by the weekly actual/projection feed,
the NFL opponent and date, and the scoring contributions. Preset feed PPR totals
are shown only as reference stats and never substituted for league scoring.
Missing data displays a dash. Missing bonus/threshold inputs mark a projection
as partial. These estimates do not replace the full app's calibrated Copilot model.
The public `api.sleeper.com/stats` and `/projections` feeds were verified against
live responses but are outside the supported v1 API documentation; failures show
a warning and preserve previously loaded data without interrupting league scores.

The page reads the public Sleeper API every 60 seconds while visible. It refreshes on return
to the tab or network. Pause stops automatic refresh; Refresh is manual. The last successful
timestamp stays visible when upstream fails. This is polling, not guaranteed real-time or
play-by-play. The score feed records changes observed during the current visit, including
negative corrections. Missing scores remain missing; commissioner overrides take precedence.

Weekly lineups use matchup starters and players when available. Otherwise the UI explicitly
labels the current roster. Injury labels are current, even when viewing a historical week.
The full player dictionary is cached for a day; unavailable metadata falls back to player IDs.
Rankings and median use all league teams as context while rendering only selected teams.
Power rankings reuse the app's existing pure model. No projections or odds are fabricated.

The explicit **Explore sample dashboard** action uses bundled fixtures with a prominent demo
banner. Public account defaults use actual API responses and never fall back to demo data.

## Full app and MCP

GitHub Pages runs the dashboard frontend. Node, Prisma, private credentials, chat, projection
generation, and MCP continue to run in the full app (for example on Replit). The **App & MCP**
tab accepts its HTTPS origin and links to existing app features; it does not embed them or
silently change the app's active league. Sync the same league and select your team there.
Trades are available through chat/MCP; there is no separate trade page in this app.

The shared registry now exposes `get_live_dashboard` to chat, HTTP MCP, and stdio MCP. Send
`league_id`, comma-separated `team_ids`, and optional `week` (a string). The tool rejects a
league that differs from the active synced league and filters all returned team collections.
An empty `team_ids` returns no teams. This is view configuration, **not authorization** for
other tools. Each recipient needs their own connected app/key. Revoke a key in app Settings
to remove MCP access. The plugin skill understands the exported preferences; it is still an
authoring package, not a published marketplace listing or multi-tenant service.

## Build and publish

```sh
npm ci
npm run dev:dashboard
npm run build:dashboard
```

The preview is at `http://localhost:3218/fantasy-copilot/`. Next exports the shared React
dashboard into `github-dashboard/out`; it is separate from the full app's server build.
No new dependencies are required. Personal defaults live in `github-dashboard/config.json`.
To reuse the dashboard, edit those profiles (or use an empty array), update `basePath` in
`github-dashboard/next.config.mjs` to match your repository, and update the README links.

Set GitHub Pages' source to **GitHub Actions**. `.github/workflows/dashboard.yml` builds and
deploys on pushes to main or the current review branch. After merging, remove the review
branch from its trigger so only main publishes. GitHub does not need any Sleeper credentials.

Validation: `npm test`, `npm run typecheck`, `npm run build`, `npm run build:dashboard`.
