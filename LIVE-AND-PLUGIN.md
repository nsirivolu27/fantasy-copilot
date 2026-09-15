# Live league view and plugin package

## What is implemented

Open `/live` and enter a Sleeper league ID or league URL. Share the resulting
`/live?league=<id>` link. An optional `&week=3` selects a scoring week.

The page reads Sleeper through the existing adapter and shows actual weekly scores,
season power rankings, median scoring, and all-play comparisons. A reported zero stays zero;
commissioner overrides take precedence. All-play counts ties and includes teams on a bye
when Sleeper reports their score. Missing weekly rows are excluded, with coverage displayed.

The browser polls every minute while visible. The server shares a one-minute snapshot per
league/week and coalesces concurrent refreshes, with bounded in-memory caches. Failed refreshes
preserve the previous snapshot and display a stale warning. Caches are per process and do not
survive a restart. This is polling, not a guaranteed real-time scoring feed.

This view does not change the deployment's active league, write to its database, or load LLM
credentials. Existing site authentication still applies. The rest of the app remains a shared
league workspace; this feature alone does not make those pages or the MCP server multi-tenant.

## Run and verify

```sh
npm install
npm test
npm run typecheck
npm run build
```

For an offline preview, run with `SLEEPER_FIXTURES=1` and open
`/live?league=1124839284756483920`. A prominent banner identifies fixture data. Remove that
environment variable before connecting a real league. Historical leagues need an explicit week.

## GitHub and Replit

GitHub stores the source and plugin package. Run the Next.js app and MCP endpoint on Replit
or another Node host; GitHub Pages cannot run this backend.

1. Import this repository into Replit or pull the reviewed feature branch into the existing Repl.
2. Use a persistent Postgres database for the full app. Follow [REPLIT.md](./REPLIT.md), especially
   removing the committed SQLite `DATABASE_URL` override before a production deployment.
3. Configure the existing authentication and sync secret before exposing the full workspace.
4. Publish, open `/live`, and connect the real Sleeper league.
5. Add the verified deployment URL and league link to the GitHub repository's About website and
   README. Do not label a screenshot or fixture demo as the live league.

No deployment URL or real user league ID has been configured by this change.

## Plugin authoring package

`plugins/fantasy-copilot/` contains a portable Agent Plugins manifest, the Codex compatibility
manifest, and a league check-in skill. It is an authoring package, not a published directory
listing. No invented server URL, registered app ID, or embedded credential is included.

For a private pilot, host one Fantasy Copilot instance per league and connect its existing
`/api/mcp` endpoint using an API key created in Settings. See [MCP.md](./MCP.md).
Once the real HTTPS endpoint is registered with the chosen plugin host, add its verified MCP
connection mapping to the package and test installation with a second user's instance.

For OpenAI distribution, follow the current
[plugin packaging guide](https://developers.openai.com/plugins/build/plugins) and
[MCP server guide](https://developers.openai.com/plugins/build/mcp-server).
Local installation, hosted connection testing, and public directory submission are separate steps.

## Before hosting unrelated users together

Accounts already exist, but isolation does not. Complete these together before opening shared
hosted workspaces to unrelated leagues:

- User-to-league membership and a per-user active league and team.
- Membership enforcement in every page, action, service, chat request, and MCP request.
- API keys scoped to the owning user/league instead of the deployment's active league.
- Isolated provider credentials, account recovery, and deletion.
- Shared-data caching, request limits, and cost controls.
- Host-appropriate per-user authentication for directory distribution and verified public metadata.

Sleeper's published API documentation distinguishes non-commercial use from commercial use.
Check its current licensing terms before charging for a marketplace product:
[Sleeper API](https://docs.sleeper.com/).
