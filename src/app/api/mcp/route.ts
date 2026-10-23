import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api/auth";
import { getActiveLeague } from "@/lib/settings";
import { runTool, tools } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * MCP server, the same tool registry the chat uses, exposed over the Model
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
    // -- Resources: things a client should be able to read without a tool call
    for (const resource of MCP_RESOURCES) {
      server.registerResource?.(
        resource.name,
        resource.uri,
        { title: resource.title, description: resource.description, mimeType: "application/json" },
        async () => {
          const league = await getActiveLeague();
          if (!league) {
            return { contents: [{ uri: resource.uri, text: "No league is synced yet." }] };
          }
          const result = await runTool(resource.tool, resource.input ?? {}, { leagueId: league.id });
          return {
            contents: [
              { uri: resource.uri, mimeType: "application/json", text: JSON.stringify(result.data ?? {}, null, 2) },
            ],
          };
        },
      );
    }

    // -- Prompts: reusable templates, which show up as slash commands
    for (const prompt of MCP_PROMPTS) {
      server.registerPrompt?.(
        prompt.name,
        { title: prompt.title, description: prompt.description, argsSchema: {} },
        async () => ({
          messages: [{ role: "user", content: { type: "text", text: prompt.text } }],
        }),
      );
    }

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
  /** Optional: older SDK versions may not expose these. */
  registerResource?: (
    name: string,
    uri: string,
    config: Record<string, unknown>,
    handler: () => Promise<unknown>,
  ) => void;
  registerPrompt?: (
    name: string,
    config: Record<string, unknown>,
    handler: () => Promise<unknown>,
  ) => void;
}

/**
 * Resources are read-only views a client can pull without deciding to call a
 * tool. Each one delegates to the same registry, so there is still one list.
 */
const MCP_RESOURCES = [
  {
    name: "league-settings",
    uri: "league://settings",
    title: "League settings",
    description: "Scoring, roster slots, waiver type, season and current week.",
    tool: "get_league_info",
    input: {},
  },
  {
    name: "standings",
    uri: "league://standings",
    title: "Standings",
    description: "Every team with record and points.",
    tool: "list_teams",
    input: {},
  },
  {
    name: "my-roster",
    uri: "roster://me",
    title: "My roster",
    description: "The user's own roster with projections.",
    tool: "get_roster",
    input: { team: "me" },
  },
];

/** Prompt templates. In Claude Desktop these appear as slash commands. */
const MCP_PROMPTS = [
  {
    name: "weekly_check_in",
    title: "Weekly check-in",
    description: "Full read on my team this week: lineup, waivers, problems.",
    text: "Check in on my fantasy team for this week. Use start_sit_advice for the lineup, get_waiver_targets for pickups, and flag any injury or bye problems. Lead with anything that needs action today, and say plainly if nothing does.",
  },
  {
    name: "trade_review",
    title: "Review a trade",
    description: "Evaluate a specific trade for both sides.",
    text: "I want to evaluate a trade. Ask me which players are moving in each direction if I haven't said, then use evaluate_trade and give me the verdict for BOTH sides honestly, including whether the other manager would actually accept it.",
  },
  {
    name: "waiver_plan",
    title: "Waiver plan",
    description: "Who to add, who to drop, what to bid.",
    text: "Build my waiver plan for this week. Use get_waiver_targets and get_drop_candidates. Give me a ranked shortlist with bids, say who to drop for each, and tell me if nothing is worth claiming.",
  },
];

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
