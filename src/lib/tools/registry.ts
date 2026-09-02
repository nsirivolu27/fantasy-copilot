import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { getSportModule } from "@/lib/sports";
import { retrieve } from "@/lib/rag";
import { bestLineup, evaluate, findTrades } from "@/lib/trade/service";
import { VERDICT_LABEL } from "@/lib/core";
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
    name: "get_projections",
    title: "Get projections",
    description:
      "Week projections for a team's players: projected points, floor, ceiling, confidence and the reasoning behind each. Use for 'how many points will X score' and to compare players. Returns nothing if projections haven't been generated yet — say so rather than guessing.",
    inputSchema: {
      type: "object",
      properties: {
        team: { type: "string", description: "Team name, manager name, or 'me'. Defaults to the user's team." },
        week: { type: "number", description: "Week number. Defaults to the league's current week." },
      },
    },
    readOnly: true,
    handler: async (input, ctx) => {
      const league = await loadLeague(ctx.leagueId);
      const team = await findTeam(ctx.leagueId, str(input.team) || "me");
      if (!team) return { summary: "No matching team.", data: null };
      const week = typeof input.week === "number" ? input.week : league.currentWeek;

      const spots = await prisma.rosterSpot.findMany({
        where: { teamId: team.id },
        include: { player: true },
      });
      const projections = await prisma.projection.findMany({
        where: {
          leagueId: ctx.leagueId,
          week,
          season: league.season,
          playerId: { in: spots.map((s) => s.playerId) },
        },
      });
      if (projections.length === 0) {
        return {
          summary: `No projections exist for week ${week} yet. They're generated from Settings → Refresh projections. Do not estimate points without them.`,
          data: [],
        };
      }
      const byPlayer = new Map(projections.map((p) => [p.playerId, p]));
      const data = spots
        .map((s) => {
          const p = byPlayer.get(s.playerId);
          if (!p) return null;
          return {
            player: s.player.fullName,
            position: s.player.position,
            isStarter: s.isStarter,
            projectedPoints: p.projectedPoints,
            floor: p.floor,
            ceiling: p.ceiling,
            confidence: p.confidence,
            reasoning: parseJson<string[]>(p.reasoningJson, []),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.projectedPoints - a.projectedPoints);

      return {
        summary: `Week ${week} projections for ${team.name} (model is only ~0.7% better than a season average — treat as a rough guide):\n${data
          .map(
            (d) =>
              `${d.player} (${d.position ?? "?"}${d.isStarter ? ", starting" : ", bench"}): ${d.projectedPoints.toFixed(1)} pts, floor ${d.floor.toFixed(1)}, ceiling ${d.ceiling.toFixed(1)}, ${(d.confidence * 100).toFixed(0)}% confidence`,
          )
          .join("\n")}`,
        data,
      };
    },
  },

  {
    name: "optimal_lineup",
    title: "Optimal lineup",
    description:
      "The best legal starting lineup for a team given current projections, and which players sit. Handles FLEX and superflex correctly.",
    inputSchema: {
      type: "object",
      properties: { team: { type: "string", description: "Team name, manager name, or 'me'." } },
    },
    readOnly: true,
    handler: async (input, ctx) => {
      const team = await findTeam(ctx.leagueId, str(input.team) || "me");
      if (!team) return { summary: "No matching team.", data: null };
      const result = await bestLineup(ctx.leagueId, team.id);
      if (result.total === 0) {
        return {
          summary: "No projections exist yet, so a lineup can't be optimized. Generate them from Settings.",
          data: null,
        };
      }
      return {
        summary: `${result.teamName} optimal lineup projects ${result.total.toFixed(1)} points: ${result.assignments
          .map((a) => `${a.slot} ${a.player?.name ?? "(empty)"}`)
          .join(", ")}. Sitting: ${result.benched.map((b) => b.name).join(", ") || "nobody"}.`,
        data: result,
      };
    },
  },

  {
    name: "evaluate_trade",
    title: "Evaluate a trade",
    description:
      "Scores a proposed trade for BOTH sides by how much each team's best starting lineup changes. Use whenever a specific trade is named. Give player names; they are resolved against rosters.",
    inputSchema: {
      type: "object",
      properties: {
        fromTeam: { type: "string", description: "Team sending the first set of players. Defaults to the user's team." },
        toTeam: { type: "string", description: "The other team's name or manager." },
        fromPlayers: { type: "string", description: "Comma-separated player names the first team sends." },
        toPlayers: { type: "string", description: "Comma-separated player names the other team sends." },
      },
      required: ["toTeam"],
    },
    readOnly: true,
    handler: async (input, ctx) => {
      const from = await findTeam(ctx.leagueId, str(input.fromTeam) || "me");
      const to = await findTeam(ctx.leagueId, str(input.toTeam));
      if (!from || !to) return { summary: "Could not resolve both teams.", data: null };
      if (from.id === to.id) return { summary: "That is the same team on both sides.", data: null };

      const fromIds = await resolvePlayerNames(from.id, str(input.fromPlayers));
      const toIds = await resolvePlayerNames(to.id, str(input.toPlayers));

      const result = await evaluate({
        leagueId: ctx.leagueId,
        fromTeamId: from.id,
        toTeamId: to.id,
        fromPlayerIds: fromIds,
        toPlayerIds: toIds,
      });

      return {
        summary: [
          `Verdict for ${from.name}: ${VERDICT_LABEL[result.verdict]}.`,
          ...result.reasoning,
          ...result.warnings,
        ].join(" "),
        data: result,
      };
    },
  },

  {
    name: "find_trades",
    title: "Find trades",
    description:
      "Scans every other roster for one-for-one swaps that improve BOTH teams. Use for 'who should I trade with' and 'find me a trade'.",
    inputSchema: {
      type: "object",
      properties: {
        team: { type: "string", description: "Team name or 'me'." },
        limit: { type: "number", description: "How many to return (default 5)." },
      },
    },
    readOnly: true,
    handler: async (input, ctx) => {
      const team = await findTeam(ctx.leagueId, str(input.team) || "me");
      if (!team) return { summary: "No matching team.", data: null };
      const limit = typeof input.limit === "number" ? Math.min(input.limit, 10) : 5;
      const found = await findTrades(ctx.leagueId, team.id, limit);
      if (found.length === 0) {
        return {
          summary:
            "No one-for-one swap improves both rosters right now. That is common in a settled league — a package deal may still work, but this app only checks 1-for-1.",
          data: [],
        };
      }
      return {
        summary: found
          .map(
            (f) =>
              `${f.evaluation.sideA.gives.join(", ")} → ${f.evaluation.sideB.teamName} for ${f.evaluation.sideB.gives.join(", ")}: you +${f.evaluation.sideA.weeklyDelta.toFixed(1)}/wk, they +${f.evaluation.sideB.weeklyDelta.toFixed(1)}/wk`,
          )
          .join("\n"),
        data: found,
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

/** Matches comma-separated names against one team's roster. */
async function resolvePlayerNames(teamId: string, names: string): Promise<string[]> {
  const wanted = names
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (wanted.length === 0) return [];

  const spots = await prisma.rosterSpot.findMany({
    where: { teamId },
    include: { player: true },
  });

  const ids: string[] = [];
  for (const name of wanted) {
    const needle = name.toLowerCase();
    const match =
      spots.find((s) => s.player.fullName.toLowerCase() === needle) ??
      spots.find((s) => s.player.fullName.toLowerCase().includes(needle));
    if (match) ids.push(match.playerId);
  }
  return ids;
}

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
