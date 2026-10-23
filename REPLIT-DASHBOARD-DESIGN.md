# Replit handoff: iOS-style dashboard design

Work in https://github.com/nsirivolu27/fantasy-copilot on `codex/live-league-plugin`
(or main after this branch is merged). Pull the current branch before editing.

## Requested next pass

Improve the live team dashboard's appearance, mobile interaction, and analytics presentation
with an iOS feel: clean system typography, grouped lists, rounded cards, restrained depth,
segmented navigation, clear touch targets, and a compact header. Keep the existing light/dark
theme tokens and respect reduced motion. Give the team and its actual scores visual priority.
Use charts only where they make the real data easier to understand.

## Working implementation

- Shared component: `src/components/TeamDashboard.tsx` and `TeamDashboard.css`.
- GitHub Pages entry: `github-dashboard/app/page.tsx`; defaults: `github-dashboard/config.json`.
- The full app uses the same component at `/live`.
- Public dashboard: https://nsirivolu27.github.io/fantasy-copilot/
- Start with Sleeper account **nihalsirivolu**, league **Babble**, league ID
  `1391520474978066432`, roster ID `2`.
- Account discovery supports every current-season football league and owned/co-owned teams.
  Connections are removable, and selected teams can be saved, shared, exported, and imported.
- Overview, weekly roster, season analytics, and score-change feed are already implemented.
- GitHub Pages is a static build reading Sleeper directly. Full-app chat, projections, trades,
  and MCP require the running backend; the dashboard offers a configurable link to that app.
- The shared tool registry includes `get_live_dashboard`, which reads exported league/team
  preferences. The plugin skill understands the same format. Marketplace publication remains
  a separate release, and team display preferences are not API access permissions.

## Preserve during design work

Keep Sleeper as the only integration in this pass. Retain live 60-second refresh, explicit
missing/stale/demo states, historical-week selection, commissioner score corrections, and
the distinction between current injury status and historical lineups. Preserve selected-team
filtering, including empty selections. Do not replace working analytics with mock numbers.
Keep core math in `src/lib/core`, platform parsing in `src/lib/platforms`, and MCP definitions
in the existing shared registry. Read `AGENTS.md` and `DESIGN.md` before editing.

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run build:dashboard` before
shipping. The dashboard publishes through `.github/workflows/dashboard.yml`; the full app
must also be deployed on Replit for backend features and MCP to become available remotely.
