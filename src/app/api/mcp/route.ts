import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api/auth";
import { getActiveLeague } from "@/lib/settings";
import { runTool, tools } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * MCP server — the same tool registry the chat uses, exposed over the Model
 * Context Protocol so Claude Desktop or Cursor can query the
 * league directly. There is deliberately no second list of tools.
 *
 * mcp-handler is loaded dynamically: if the package is missing or its API has
 * moved, this endpoint returns a clear 501 instead of failing the whole build.
 * Everything else in the app keeps working.
 */
async function buildHandler() {
  const { createMcpHandler } = (await import("mcp-handler")) as {
    createMcpHandler: (init: (server: McpServerLike) => void) => (req: Request) => Promise<Response>;
  };

  return createMcpHandler((server) => {
    for (const tool of tools) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { readOnlyHint: tool.readOnly },
        },
        async (input: Record<string, unknown>) => {
          const league = await getActiveLeague();
          if (!league) {
            return {
              content: [
                { type: "text", text: "No league is synced yet. Sync one in the app's Settings first." },
              ],
              isError: true,
            };
          }
          const result = await runTool(tool.name, input ?? {}, { leagueId: league.id });
          return {
            content: [{ type: "text", text: result.summary }],
            structuredContent: result.data as Record<string, unknown>,
          };
        },
      );
    }
  });
}

interface McpServerLike {
  registerTool: (
    name: string,
    config: Record<string, unknown>,
    handler: (input: Record<string, unknown>) => Promise<unknown>,
  ) => void;
}

let cached: ((req: Request) => Promise<Response>) | null = null;

async function handle(request: Request): Promise<Response> {
  // The MCP endpoint carries no cookies, so it authenticates by API key like
  // the rest of the public surface. Any key with read:league may connect.
  const auth = await authenticate(request, "read:league");
  if (!auth.ok) {
    return NextResponse.json(
      {
        error: auth.error,
        hint: "Create an API key in Settings, then set it as the bearer token in your MCP client config.",
      },
      { status: auth.status ?? 401 },
    );
  }

  try {
    cached = cached ?? (await buildHandler());
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    console.error("[mcp] handler unavailable:", detail);
    return NextResponse.json(
      {
        error: "The MCP endpoint is not available in this build.",
        hint: "Run `npm install mcp-handler` and redeploy. Every other API still works.",
        detail,
      },
      { status: 501 },
    );
  }

  return cached(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
