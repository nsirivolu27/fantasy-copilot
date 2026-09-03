/**
 * Local stdio entrypoint for MCP clients that prefer a subprocess over HTTP —
 * the easiest path for Claude Desktop on the same machine as the app.
 *
 *   npx tsx mcp/stdio.ts
 *
 * Claude Desktop config:
 *
 *   {
 *     "mcpServers": {
 *       "fantasy-copilot": {
 *         "command": "npx",
 *         "args": ["tsx", "/absolute/path/to/mcp/stdio.ts"],
 *         "env": { "DATABASE_URL": "file:/absolute/path/to/prisma/dev.db" }
 *       }
 *     }
 *   }
 *
 * No API key here: a local subprocess already has the database, so the key
 * would protect nothing. The HTTP endpoint is the one that needs auth.
 */

import { getActiveLeague } from "../src/lib/settings";
import { runTool, tools } from "../src/lib/tools/registry";

async function main() {
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { CallToolRequestSchema, ListToolsRequestSchema } = await import(
    "@modelcontextprotocol/sdk/types.js"
  );

  const server = new Server(
    { name: "fantasy-copilot", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { readOnlyHint: true },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const league = await getActiveLeague();
    if (!league) {
      return {
        content: [{ type: "text", text: "No league is synced yet. Sync one in the app first." }],
        isError: true,
      };
    }
    const result = await runTool(
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, unknown>,
      { leagueId: league.id },
    );
    return { content: [{ type: "text", text: result.summary }] };
  });

  await server.connect(new StdioServerTransport());
  // stdout is the protocol channel, so logs must go to stderr.
  console.error("[fantasy-copilot] MCP stdio server ready");
}

main().catch((err) => {
  console.error("[fantasy-copilot] failed to start:", err);
  process.exit(1);
});
