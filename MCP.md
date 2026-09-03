# MCP server

Fantasy Copilot exposes its tools over the [Model Context Protocol](https://modelcontextprotocol.io),
so Claude Desktop, Cursor or any MCP client can query your league directly.

## Connect

1. Create an API key in **Settings → MCP access**. It's shown once and stored only as a SHA-256
   hash, and the page gives you a ready-to-paste client config.
2. Add the server to your client's config:

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

Running locally, the URL is `http://localhost:3000/api/mcp`.

## Tools

All ten come from `src/lib/tools/registry.ts` — the same list the in-app chat uses. There is
deliberately no second list, so adding a tool adds it in both places.

| Tool | What it does |
|---|---|
| `get_league_info` | Scoring, roster slots, waiver type, season, current week |
| `list_teams` | Standings with records and points |
| `get_roster` | One team's roster, starters and bench, with injury status |
| `find_player` | Look up a rostered player and who has him |
| `get_projections` | Week projections with floor, ceiling, confidence, reasoning |
| `optimal_lineup` | Best legal lineup for a team |
| `start_sit_advice` | Current vs optimal lineup, changes worth making, coin flips, alerts |
| `evaluate_trade` | Two-sided verdict on a proposed trade |
| `find_trades` | One-for-one swaps that improve both rosters |
| `get_waiver_targets` | Free agents ranked by lineup gain, with FAAB bids |
| `get_drop_candidates` | Roster ranked by what dropping each would cost |
| `get_streamers` | Best QB/TE/K/DST streams with three-week matchups |
| `search_league` | Free-text retrieval across everything synced |

## Resources and prompts

Three resources are readable without a tool call: `league://settings`, `league://standings` and
`roster://me`. They delegate to the same registry, so there is still one list.

Three prompt templates appear as slash commands in clients that support them:
`weekly_check_in`, `trade_review` and `waiver_plan`.

## Every tool is read-only

Nothing over MCP can submit a waiver claim, drop a player or send a trade offer. That's a
deliberate limit, not a gap: write actions belong behind an explicit human confirmation, never
an autonomous tool call.

## Running it locally over stdio

If the app runs on the same machine, a subprocess is simpler than HTTP:

```json
{
  "mcpServers": {
    "fantasy-copilot": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp/stdio.ts"],
      "env": { "DATABASE_URL": "file:/absolute/path/to/prisma/dev.db" }
    }
  }
}
```

No API key there — a local subprocess already has the database, so a key would protect nothing.

## If it returns 501

The MCP package is loaded dynamically so a missing dependency can't break the rest of the app.
Run `npm install` and redeploy — every other endpoint keeps working in the meantime.
