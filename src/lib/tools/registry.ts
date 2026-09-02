import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { getSportModule } from "@/lib/sports";
import { retrieve } from "@/lib/rag";
import type { NormalizedSlot } from "@/lib/platforms/types";

/**
 * The tool registry: every capability defined exactly once.
 *
 * This is the keystone of later phases — the chat route converts these to the
 * model's function-calling format, and the MCP server (Phase 10) will expose
 * the same array. Adding a tool here adds it everywhere. There must never be
 * a second list.
 *
 * Every tool is read-only. Every handler returns structured data plus a short
 * human-readable summary, so a model that can't call tools can still be handed
 * the summary as plain context.
 */

export interface ToolContext {
  leagueId: string;
}

export interface ToolResult {
  summary: string;
  data: unknown;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: string; description: string; enum?: string[] }>;
  required?: string[];
}

export interface FantasyTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  readOnly: true;
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

async function loadLeague(leagueId: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("No league is synced yet. Sync one in Settings first.");
  return league;
}

/** Resolves "my team", a team name, or a manager name to one team row. */
async function findTeam(leagueId: string, nameOrMine: string) {
  const wantsMine = !nameOrMine || /^(me|my|my team|mine)$/i.test(nameOrMine.trim());
  if (wantsMine) {
    const mine = await prisma.team.findFirst({ where: { leagueId, isMine: true } });
    if (mine) return mine;
    if (!nameOrMine) return null;
  }
  const teams = await prisma.team.findMany({ where: { leagueId } });
  const needle = nameOrMine.toLowerCase().trim();
  return (
    teams.find((t) => t.name.toLowerCase() === needle) ??
    teams.find((t) => t.ownerName?.toLowerCase() === needle) ??
    teams.find((t) => t.name.toLowerCase().includes(needle)) ??
    teams.find((t) => t.ownerName?.toLowerCase().includes(needle)) ??
    null
  );
}

export const tools: FantasyTool[] = [
  {
    name: "get_league_info",
    title: "League info",
    description:
      "Scoring settings, roster slots, team count, waiver type, season and current week for the synced league. Use this whenever the answer depends on league format or rules.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    handler: async (_input, ctx) => {
      const league = await loadLeague(ctx.leagueId);
      const sport = getSportModule(league.sport);
      const scoring = parseJson<Record<string, number>>(league.scoringSettingsJson, {});
      const slots = parseJson<NormalizedSlot[]>(league.rosterSlotsJson, []);
      const data = {
        name: league.name,
        platform: league.platform,
        season: league.season,
        currentWeek: league.currentWeek,
        teamCount: league.teamCount,
        isDynasty: league.isDynasty,
        isKeeper: league.isKeeper,
        waiverType: league.waiverType,
        waiverBudget: league.waiverBudget,
        startingSlots: slots.filter((s) => s.isStarter).map((s) => sport.slotLabel(s.code)),
        benchSlots: slots.filter((s) => !s.isStarter).map((s) => sport.slotLabel(s.code)),
        scoringSettings: scoring,
        lastSyncedAt: league.lastSyncedAt,
        syncStatus: league.syncStatus,
      };
      return {
        summary: `${league.name}: ${league.teamCount} teams, season ${league.season}, week ${league.currentWeek}. Starters: ${data.startingSlots.join(", ")}. PPR value: ${scoring.rec ?? 0}.`,
        data,
      };
    },
  },

  {
    name: "list_teams",
    title: "List teams",
    description:
      "Every team in the league with manager, record, points for and points against, best record first. Use for standings-style questions.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    handler: async (_input, ctx) => {
      const teams = await prisma.team.findMany({
        where: { leagueId: ctx.leagueId },
        orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
      });
      const data = teams.map((t, i) => ({
        rank: i + 1,
        name: t.name,
        manager: t.ownerName,
        record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
        pointsFor: t.pointsFor,
        pointsAgainst: t.pointsAgainst,
        isMine: t.isMine,
      }));
      return {
        summary: data
          .map((t) => `${t.rank}. ${t.name} (${t.record}, ${t.pointsFor.toFixed(1)} PF)${t.isMine ? " — the user's team" : ""}`)
          .join("\n"),
        data,
      };
    },
  },

  {
    name: "get_roster",
    title: "Get a roster",
    description:
      "Full roster for one team, split into starters and bench, with position, NFL team and injury status. Pass team as 'me' for the user's own team, or a team or manager name.",
    inputSchema: {
      type: "object",
      properties: {
        team: {
          type: "string",
          description: "Team name, manager name, or 'me' for the user's own team.",
        },
      },
    },
    readOnly: true,
    handler: async (input, ctx) => {
      const league = await loadLeague(ctx.leagueId);
      const sport = getSportModule(league.sport);
      const team = await findTeam(ctx.leagueId, str(input.team) || "me");
      if (!team) {
        return {
          summary:
            "No matching team. Either the name didn't match, or no team is marked as the user's in Settings.",
          data: null,
        };
      }
      const spots = await prisma.rosterSpot.findMany({
        where: { teamId: team.id },
        include: { player: true },
        orderBy: [{ isStarter: "desc" }, { slotIndex: "asc" }],
      });
      const shape = (s: (typeof spots)[number]) => ({
        slot: sport.slotLabel(s.slot),
        player: s.player.fullName,
        position: s.player.position,
        nflTeam: s.player.nflTeam,
        injuryStatus: s.player.injuryStatus,
      });
      const starters = spots.filter((s) => s.isStarter).map(shape);
      const bench = spots.filter((s) => !s.isStarter).map(shape);
      return {
        summary: [
          `${team.name} (${team.wins}-${team.losses}), managed by ${team.ownerName ?? "unknown"}.`,
          `Starters: ${starters.map((s) => `${s.slot} ${s.player}`).join(", ") || "none set"}.`,
          `Bench: ${bench.map((s) => s.player).join(", ") || "empty"}.`,
        ].join(" "),
        data: { team: team.name, manager: team.ownerName, isMine: team.isMine, starters, bench },
      };
    },
  },

  {
    name: "find_player",
    title: "Find a player",
    description:
      "Look up a rostered player by name: position, NFL team, injury status, and which league team rosters them. Use for 'who has X' and 'is X hurt'.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Full or partial player name." } },
      required: ["name"],
    },
    readOnly: true,
    handler: async (input, ctx) => {
      const name = str(input.name).trim();
      if (!name) return { summary: "No player name was given.", data: null };

      const spots = await prisma.rosterSpot.findMany({
        where: { team: { leagueId: ctx.leagueId }, player: { fullName: { contains: name } } },
        include: { player: true, team: true },
        take: 10,
      });
      if (spots.length === 0) {
        return {
          summary: `No rostered player matches "${name}". They may be a free agent, or the name may be spelled differently.`,
          data: [],
        };
      }
      const data = spots.map((s) => ({
        player: s.player.fullName,
        position: s.player.position,
        nflTeam: s.player.nflTeam,
        injuryStatus: s.player.injuryStatus,
        rosteredBy: s.team.name,
        slot: s.slot,
        isStarter: s.isStarter,
      }));
      return {
        summary: data
          .map(
            (d) =>
              `${d.player} (${d.position ?? "?"}, ${d.nflTeam ?? "FA"}) is rostered by ${d.rosteredBy}${d.isStarter ? " and starting" : " on the bench"}${d.injuryStatus ? `, listed ${d.injuryStatus}` : ""}.`,
          )
          .join(" "),
        data,
      };
    },
  },

  {
    name: "search_league",
    title: "Search league data",
    description:
      "Free-text search across everything synced — league settings, scoring, teams, rosters and players. Use this when no other tool fits, or to gather background before answering.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, in plain language." },
        limit: { type: "number", description: "How many results to return (default 6)." },
      },
      required: ["query"],
    },
    readOnly: true,
    handler: async (input, ctx) => {
      const query = str(input.query);
      const limit = typeof input.limit === "number" ? Math.min(input.limit, 15) : 6;
      const hits = await retrieve(ctx.leagueId, query, { limit });
      return {
        summary:
          hits.length === 0
            ? `Nothing in the synced league data matches "${query}".`
            : hits.map((h) => `${h.title}: ${h.text}`).join("\n\n"),
        data: hits.map((h) => ({ id: h.id, kind: h.kind, title: h.title, score: h.score })),
      };
    },
  },
];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = toolsByName.get(name);
  if (!tool) return { summary: `Unknown tool "${name}".`, data: null };
  try {
    return await tool.handler(input, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool failed.";
    return { summary: `Tool "${name}" failed: ${message}`, data: null };
  }
}
